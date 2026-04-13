import { Injectable, UnauthorizedException, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { RegisterProviderDto, LoginUserDto } from '@app/common';
import 'multer';

@Injectable()
export class AuthService {
  constructor(private readonly supabase: SupabaseClient) {}

  async register(dto: any) {
    try {
      const { data: authData, error: authError } = await this.supabase.auth.signUp({
        email: dto.email,
        password: dto.password,
      });
      if (authError) throw new Error(`Auth Error: ${authError.message}`);
      const userId = authData.user!.id;

      const { error: userTableError } = await this.supabase.schema('identity_and_user').from('users')
        .insert([{ id: userId, role: dto.role || 'customer', full_name: dto.full_name, email: dto.email, contact_number: dto.contact_number }]);
      if (userTableError) {
        await this.supabase.auth.admin.deleteUser(userId);
        throw new Error(`Users Table Error: ${userTableError.message}`);
      }

      const { error: profileError } = await this.supabase.schema('identity_and_user').from('customer_profiles')
        .insert([{ user_id: userId, full_name: dto.full_name, address: dto.address }]);
      if (profileError) {
        await this.supabase.schema('identity_and_user').from('users').delete().eq('id', userId);
        await this.supabase.auth.admin.deleteUser(userId);
        throw new Error(`Profile Table Error: ${profileError.message}`);
      }

      const { data: signInData } = await this.supabase.auth.signInWithPassword({ email: dto.email, password: dto.password });

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
      const identifier = loginDto.email;
      const password = loginDto.password;
      const isEmail = identifier.includes('@');
      let loginEmail = identifier;

      if (!isEmail) {
        const { data: userRecord, error: dbError } = await this.supabase.schema('identity_and_user').from('users').select('email').eq('contact_number', identifier).single();
        if (dbError || !userRecord) throw new UnauthorizedException('Phone number not registered.');
        loginEmail = userRecord.email;
      }

      const { data, error } = await this.supabase.auth.signInWithPassword({ email: loginEmail, password });
      if (error) throw new UnauthorizedException('Invalid Credentials');

      const userId = data.user?.id;
      const { data: userData, error: userError } = await this.supabase.schema('identity_and_user').from('users').select('role, status, full_name').eq('id', userId).single();
      if (userError || !userData) throw new InternalServerErrorException('Error fetching user profile');

      if (userData.status === 'pending' || userData.status === 'rejected') {
        await this.supabase.auth.signOut();
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
    const { full_name, email, contact_number, password, role, business_name, document_type, date_of_birth } = dto;

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,128}$/;
    if (!passwordRegex.test(password)) {
      throw new BadRequestException('Password must be 8-128 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.');
    }

    const { data: authData, error: authError } = await this.supabase.auth.signUp({ email, password } as any);
    if (authError) throw new BadRequestException(`Auth Registration Error: ${authError.message}`);

    const newUserId = authData.user?.id;
    if (!newUserId) throw new BadRequestException('Could not retrieve user ID from Supabase');

    const { error: userError } = await this.supabase.schema('identity_and_user').from('users')
      .insert([{ id: newUserId, full_name, email, contact_number, role, status: 'pending', is_verified: false, date_of_birth }]);
    if (userError) { await this.supabase.auth.admin.deleteUser(newUserId); throw new BadRequestException(`User Profile Error: ${userError.message}`); }

    const { data: profile, error: profileError } = await this.supabase.schema('provider_catalog').from('provider_profiles')
      .insert([{ user_id: newUserId, business_name, verification_status: 'pending' }]).select().single();
    if (profileError) throw new BadRequestException(`Provider Profile Error: ${profileError.message}`);

    const filePath = `kyc/${newUserId}/${Date.now()}_${file.originalname}`;
    const { error: uploadError } = await this.supabase.storage.from('verification-docs')
      .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: false });
    if (uploadError) throw new BadRequestException(`Storage Upload Error: ${uploadError.message}`);

    const { error: docError } = await this.supabase.schema('provider_catalog').from('provider_documents')
      .insert([{ provider_id: newUserId, document_type, document_file_path: filePath, status: 'pending' }]);
    if (docError) throw new BadRequestException(`Document Link Error: ${docError.message}`);

    return { status: 'success', message: 'Provider application submitted. Pending approval.', data: { provider_id: newUserId, business_name: profile.business_name, verification_status: profile.verification_status } };
  }

  async refreshSession(refreshToken: string) {
    const { data, error } = await this.supabase.auth.refreshSession({ refresh_token: refreshToken });
    if (error) throw new UnauthorizedException('Failed to refresh session: ' + error.message);
    const userId = data.user?.id;
    let userData: any = null;
    if (userId) {
      const { data: u } = await this.supabase.schema('identity_and_user').from('users').select('role, full_name').eq('id', userId).single();
      userData = u;
    }
    return { access_token: data.session?.access_token, refresh_token: data.session?.refresh_token, user: { id: data.user?.id, email: data.user?.email, full_name: userData?.full_name, role: userData?.role } };
  }

  async getCurrentUser(userId: string) {
    const { data, error } = await this.supabase.schema('identity_and_user').from('users')
      .select('id, full_name, email, contact_number, role, status').eq('id', userId).single();
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
