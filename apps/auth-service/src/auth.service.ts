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
  connectKafkaClientWithRetry,
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
    this.kafka.subscribeToResponseOf(PROVIDER_PATTERNS.GET_PROFILES_BY_IDS);
    await connectKafkaClientWithRetry(this.kafka, {
      context: AuthService.name,
    });
  }

  private async createProviderApplication(payload: {
    userId: string;
    businessName: string;
    documentType: string;
    filePath: string;
    dateOfBirth?: string | null;
  }) {
    return await sendKafkaRpcRequest(
      () =>
        this.kafka.send(PROVIDER_PATTERNS.CREATE_PROVIDER_APPLICATION, payload),
      { context: PROVIDER_PATTERNS.CREATE_PROVIDER_APPLICATION },
    );
  }

  private createAuthClient() {
    const serviceName = process.env.SERVICE_NAME ? process.env.SERVICE_NAME.trim() : '';
    const strictServiceScope = process.env.SUPABASE_STRICT_SERVICE_SCOPE?.trim().toLowerCase() === 'true';

    let supabaseUrl = process.env.SUPABASE_URL;
    let supabaseKey = process.env.SUPABASE_SECRET_KEY;

    if (serviceName) {
      const prefix = serviceName.replaceAll(/[^A-Za-z0-9]+/g, '_').toUpperCase();
      supabaseUrl = process.env[`${prefix}_SUPABASE_URL`] || supabaseUrl;
      supabaseKey = process.env[`${prefix}_SUPABASE_SECRET_KEY`] || supabaseKey;
      
      if (strictServiceScope && (!process.env[`${prefix}_SUPABASE_URL`] || !process.env[`${prefix}_SUPABASE_SECRET_KEY`])) {
        throw new Error(`Strict service-scoped Supabase mode is enabled. Missing ${prefix}_SUPABASE_URL and/or ${prefix}_SUPABASE_SECRET_KEY.`);
      }
    }

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

  private async getProviderVerificationStatus(userId: string | null | undefined) {
    if (!userId) return null;

    try {
      const response = await sendKafkaRpcRequest<{ profiles?: any[] }>(
        () =>
          this.kafka.send(PROVIDER_PATTERNS.GET_PROFILES_BY_IDS, {
            userIds: [userId],
          }),
        { context: PROVIDER_PATTERNS.GET_PROFILES_BY_IDS },
      );
      const profile = Array.isArray(response?.profiles)
        ? response.profiles.find(
            (row: any) => String(row?.user_id || '').trim() === userId,
          ) || response.profiles[0]
        : null;

      return profile?.verification_status || 'pending';
    } catch {
      return null;
    }
  }

  private buildSessionUser(userData: {
    id?: string;
    email?: string | null;
    full_name?: string | null;
    contact_number?: string | null;
    role?: string | null;
    status?: string | null;
  }, verificationStatus?: string | null) {
    return {
      id: userData.id,
      email: userData.email,
      full_name: userData.full_name,
      contact_number: userData.contact_number,
      role: userData.role,
      status: userData.status,
      user_metadata: verificationStatus ? { verification_status: verificationStatus } : {},
    };
  }

  private async assertAccountIsActive(
    userData: { status?: string | null },
    authClient?: SupabaseClient,
  ) {
    const status = String(userData?.status || '').trim().toLowerCase();
    if (status !== 'suspended' && status !== 'inactive') {
      return;
    }

    if (authClient) {
      await authClient.auth.signOut();
    }

    throw new UnauthorizedException({
      message: 'Access Denied: Account is not active.',
      current_status: status,
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
          role: 'customer',
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
        .insert([{ user_id: userId }]);
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
          user: { id: userId, email: dto.email, full_name: dto.full_name, role: 'customer' },
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
      if (error) throw new UnauthorizedException('Invalid Credentials');

      const userId = data.user?.id;
      const { data: userData, error: userError } = await this.supabase
        .schema('identity_and_user')
        .from('users')
        .select('id, full_name, email, contact_number, role, status')
        .eq('id', userId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (userError || !userData) {
        throw new InternalServerErrorException('Error fetching user profile');
      }

      await this.assertAccountIsActive(userData, authClient);

      const verificationStatus =
        userData.role === 'provider'
          ? await this.getProviderVerificationStatus(userId)
          : null;

      return {
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
        user: this.buildSessionUser(
          {
            id: data.user?.id,
            email: data.user?.email,
            full_name: userData.full_name,
            contact_number: userData.contact_number,
            role: userData.role,
            status: userData.status,
          },
          verificationStatus,
        ),
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
    const { full_name, email, contact_number, password, business_name, document_type, date_of_birth } = dto;

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,128}$/;
    if (!passwordRegex.test(password)) {
      throw new BadRequestException('Password must be 8-128 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.');
    }

    const { data: authData, error: authError } = await authClient.auth.signUp({ email, password } as any);
    if (authError) throw new BadRequestException(`Auth Registration Error: ${authError.message}`);

    const newUserId = authData.user?.id;
    if (!newUserId) throw new BadRequestException('Could not retrieve user ID from Supabase');

    const { error: userError } = await this.supabase.schema('identity_and_user').from('users')
      .insert([{ id: newUserId, full_name, email, contact_number, role: 'provider', status: 'active', is_verified: false }]);
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
        dateOfBirth: date_of_birth || null,
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
        .select('role, full_name, contact_number, status')
        .eq('id', userId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      userData = u;
    }

    await this.assertAccountIsActive(userData, authClient);

    const verificationStatus =
      userData?.role === 'provider'
        ? await this.getProviderVerificationStatus(userId)
        : null;

    return {
      access_token: data.session?.access_token,
      refresh_token: data.session?.refresh_token,
      user: this.buildSessionUser(
        {
          id: data.user?.id,
          email: data.user?.email,
          full_name: userData?.full_name,
          contact_number: userData?.contact_number,
          role: userData?.role,
          status: userData?.status,
        },
        verificationStatus,
      ),
    };
  }

  async getCurrentUser(userId: string) {
    const { data, error } = await this.supabase.schema('identity_and_user').from('users')
      .select('id, full_name, email, contact_number, role, status')
      .eq('id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new InternalServerErrorException('Failed to fetch user: ' + error.message);
    if (!data) throw new UnauthorizedException('User profile not found.');

    await this.assertAccountIsActive(data);

    const verificationStatus =
      data?.role === 'provider'
        ? await this.getProviderVerificationStatus(userId)
        : null;

    return {
      user: this.buildSessionUser(data, verificationStatus),
    };
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
