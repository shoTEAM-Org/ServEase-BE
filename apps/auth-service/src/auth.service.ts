import {
  Inject,
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  RegisterProviderDto,
  LoginUserDto,
  PROVIDER_PATTERNS,
  sendKafkaRpcRequest,
} from '@app/common';
import 'multer';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly supabase: SupabaseClient,
    @Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka,
  ) {}

  async onModuleInit() {
    this.kafka.subscribeToResponseOf(PROVIDER_PATTERNS.CREATE_PROVIDER_APPLICATION);
    await this.kafka.connect();
  }

  private async createProviderApplication(payload: {
    userId: string;
    businessName: string;
    documentType: string;
    filePath: string;
  }) {
    return await sendKafkaRpcRequest(
      () =>
        this.kafka.send(PROVIDER_PATTERNS.CREATE_PROVIDER_APPLICATION, payload),
      { context: PROVIDER_PATTERNS.CREATE_PROVIDER_APPLICATION },
    );
  }

  private createAuthClient() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new InternalServerErrorException('Supabase environment variables are missing.');
    }

    // Use a dedicated auth client so user sign-in sessions do not leak into the
    // shared service-role client used for backend table reads.
    return createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  async register(dto: any) {
    try {
      const authClient = this.createAuthClient();
      const { data: authData, error: authError } = await authClient.auth.signUp({
        email: dto.email,
        password: dto.password,
      });
      if (authError) throw new Error(`Auth Error: ${authError.message}`);
      const userId = authData.user!.id;

      const { error: userTableError } = await this.supabase.schema('identity_and_user').from('users')
        .insert([{
          id: userId,
          role: dto.role || 'customer',
          status: 'active',
          is_verified: true,
          full_name: dto.full_name,
          email: dto.email,
          contact_number: dto.contact_number,
        }]);
      if (userTableError) {
        await this.supabase.auth.admin.deleteUser(userId);
        throw new Error(`Users Table Error: ${userTableError.message}`);
      }

      const { error: profileError } = await this.supabase.schema('identity_and_user').from('customer_profiles')
        .insert([{ user_id: userId, full_name: dto.full_name, contact_number: dto.contact_number }]);
      if (profileError) {
        await this.supabase.schema('identity_and_user').from('users').delete().eq('id', userId);
        await this.supabase.auth.admin.deleteUser(userId);
        throw new Error(`Profile Table Error: ${profileError.message}`);
      }

      const { data: signInData } = await authClient.auth.signInWithPassword({ email: dto.email, password: dto.password });

      return {
        session: {
          access_token: signInData?.session?.access_token || null,
          refresh_token: signInData?.session?.refresh_token || null,
          user: { id: userId, email: dto.email, full_name: dto.full_name, role: dto.role || 'customer' },
        },
      };
    } catch (err: any) {
      console.error('Registration Crash:', err.message);
      throw new InternalServerErrorException(err.message);
    }
  }

  async login(loginDto: LoginUserDto) {
    try {
      const authClient = this.createAuthClient();
      const identifier = loginDto.email;
      const password = loginDto.password;
      const isEmail = identifier.includes('@');
      let loginEmail = identifier;

      if (!isEmail) {
        const { data: userRecord, error: dbError } = await this.supabase
          .schema('identity_and_user')
          .from('users')
          .select('email')
          .eq('contact_number', identifier)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (dbError || !userRecord?.email) {
          throw new UnauthorizedException('Phone number not registered.');
        }
        loginEmail = userRecord.email;
      }

      const { data, error } = await authClient.auth.signInWithPassword({ email: loginEmail, password });
      if (error) {
        try {
          const { data: loginUserRecord, error: loginUserLookupError } = await this.supabase
            .schema('identity_and_user')
            .from('users')
            .select('id, email, contact_number, role, status')
            .eq('email', loginEmail)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          console.error('[auth] Login signInWithPassword failed:', {
            identifier,
            loginEmail,
            supabaseAuthError: {
              message: error.message,
              code: (error as any).code,
              status: (error as any).status,
            },
            userLookup: {
              found: Boolean(loginUserRecord),
              error: loginUserLookupError
                ? {
                    message: loginUserLookupError.message,
                    code: loginUserLookupError.code,
                  }
                : null,
              status: loginUserRecord?.status,
              role: loginUserRecord?.role,
            },
          });
        } catch (logError: any) {
          console.error('[auth] Login failure logging failed:', {
            identifier,
            loginEmail,
            supabaseAuthError: {
              message: error.message,
              code: (error as any).code,
              status: (error as any).status,
            },
            loggingError: logError?.message,
          });
        }

        throw new UnauthorizedException('Invalid Credentials');
      }

      const userId = data.user?.id;
      console.log('[auth] Runtime SUPABASE_URL:', process.env.SUPABASE_URL);
      console.log('[auth] Supabase Auth userId:', userId);
      const { data: userData, error: userError } = await this.supabase
        .schema('identity_and_user')
        .from('users')
        .select('id, full_name, email, contact_number, role, status')
        .eq('id', userId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      console.log('[auth] Users table lookup result:', userData);
      if (userError || !userData) {
        console.error('Users table error:', userError);
        throw new InternalServerErrorException('Error fetching user profile');
      }

      if (userData.status === 'pending' || userData.status === 'rejected') {
        await authClient.auth.signOut();
        throw new UnauthorizedException({ message: 'Access Denied: Provider account is not yet active.', current_status: userData.status });
      }

      return {
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
        user: { id: data.user?.id, email: data.user?.email, full_name: userData.full_name, role: userData.role },
      };
    } catch (err: any) {
      if (err instanceof UnauthorizedException) throw err;
      console.error('Login Error:', err.message);
      throw new UnauthorizedException(err.response || err.message);
    }
  }

  async registerProvider(dto: RegisterProviderDto, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('document_file image is required');
    const authClient = this.createAuthClient();
    const { full_name, email, contact_number, password, role, business_name, document_type, date_of_birth } = dto;

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,128}$/;
    if (!passwordRegex.test(password)) {
      throw new BadRequestException('Password must be 8-128 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.');
    }

    const { data: authData, error: authError } = await authClient.auth.signUp({ email, password } as any);
    if (authError) throw new BadRequestException(`Auth Registration Error: ${authError.message}`);

    const newUserId = authData.user?.id;
    if (!newUserId) throw new BadRequestException('Could not retrieve user ID from Supabase');

    const { error: userError } = await this.supabase.schema('identity_and_user').from('users')
      .insert([{ id: newUserId, full_name, email, contact_number, role, status: 'pending', is_verified: false, date_of_birth }]);
    if (userError) { await this.supabase.auth.admin.deleteUser(newUserId); throw new BadRequestException(`User Profile Error: ${userError.message}`); }

    const filePath = `kyc/${newUserId}/${Date.now()}_${file.originalname}`;
    const { error: uploadError } = await this.supabase.storage.from('verification-docs')
      .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: false });
    if (uploadError) {
      await this.supabase.schema('identity_and_user').from('users').delete().eq('id', newUserId);
      await this.supabase.auth.admin.deleteUser(newUserId);
      throw new BadRequestException(`Storage Upload Error: ${uploadError.message}`);
    }

    try {
      const providerApplication = await this.createProviderApplication({
        userId: newUserId,
        businessName: business_name,
        documentType: document_type,
        filePath,
      });

      return {
        status: 'success',
        message: 'Provider application submitted. Pending approval.',
        data: providerApplication,
      };
    } catch (error: any) {
      await this.supabase.storage
        .from('verification-docs')
        .remove([filePath]);
      await this.supabase
        .schema('identity_and_user')
        .from('users')
        .delete()
        .eq('id', newUserId);
      await this.supabase.auth.admin.deleteUser(newUserId);

      throw new BadRequestException(
        `Provider Profile Error: ${error?.message || 'Failed to create provider application'}`,
      );
    }
  }

  async refreshSession(refreshToken: string) {
    const authClient = this.createAuthClient();
    const { data, error } = await authClient.auth.refreshSession({ refresh_token: refreshToken });
    if (error) throw new UnauthorizedException('Failed to refresh session: ' + error.message);
    const userId = data.user?.id;
    let userData: any = null;
    if (userId) {
      const { data: u } = await this.supabase
        .schema('identity_and_user')
        .from('users')
        .select('role, full_name')
        .eq('id', userId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      userData = u;
    }
    return { access_token: data.session?.access_token, refresh_token: data.session?.refresh_token, user: { id: data.user?.id, email: data.user?.email, full_name: userData?.full_name, role: userData?.role } };
  }

  async getCurrentUser(userId: string) {
    const { data, error } = await this.supabase.schema('identity_and_user').from('users')
      .select('id, full_name, email, contact_number, role, status')
      .eq('id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new InternalServerErrorException('Failed to fetch user: ' + error.message);
    return { user: data };
  }

  async logout(accessToken: string) {
    try { await this.supabase.auth.admin.signOut(accessToken); } catch { /* best-effort */ }
    return { ok: true };
  }

  async requestPasswordReset(email: string, redirectTo?: string) {
    const { error } = await this.supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectTo || undefined });
    if (error) throw new BadRequestException('Password reset failed: ' + error.message);
    return { message: 'Password reset email sent.' };
  }

  async resetPassword(body: { password: string; access_token?: string; refresh_token?: string }) {
    if (body.access_token && body.refresh_token) {
      await this.supabase.auth.setSession({ access_token: body.access_token, refresh_token: body.refresh_token });
    }
    const { error } = await this.supabase.auth.updateUser({ password: body.password });
    if (error) throw new BadRequestException('Password reset failed: ' + error.message);
    return { message: 'Password updated successfully.' };
  }
}
