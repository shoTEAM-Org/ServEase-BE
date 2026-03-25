import { Injectable, UnauthorizedException, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { supabase } from '@app/database';
import { RegisterProviderDto, LoginUserDto } from '@app/common';
import 'multer';

@Injectable()
export class AuthService {

  async register(dto: any) {
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: dto.email,
        password: dto.password,
      });

      if (authError) throw new Error(`Auth Error: ${authError.message}`);
      const userId = authData.user!.id;

      const { error: userTableError } = await supabase
        .from('users')
        .insert([{
          id: userId,
          role: dto.role || 'customer',
          full_name: dto.full_name,
          email: dto.email,
          contact_number: dto.contact_number,
        }]);

      if (userTableError) throw new Error(`Users Table Error: ${userTableError.message}`);

      const { error: profileError } = await supabase
        .from('customer_profiles')
        .insert([{ user_id: userId, address: dto.address }]);

      if (profileError) throw new Error(`Profile Table Error: ${profileError.message}`);

      return {
        status: 201,
        message: 'Registration Successful. Data inserted in all tables.',
        userId,
      };
    } catch (err) {
      console.error('Registration Crash:', err.message);
      throw new InternalServerErrorException(err.message);
    }
  }

  async login(loginDto: LoginUserDto) {
    try {
      const identifier = loginDto.identifier;
      const password = loginDto.password;
      const isEmail = identifier.includes('@');
      let loginEmail = identifier;

      if (!isEmail) {
        const { data: userRecord, error: dbError } = await supabase
          .from('users')
          .select('email')
          .eq('contact_number', identifier)
          .single();

        if (dbError || !userRecord) throw new UnauthorizedException('Phone number not registered.');
        loginEmail = userRecord.email;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      });

      if (error) throw new UnauthorizedException('Invalid Credentials');

      const userId = data.user?.id;
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('role, status')
        .eq('id', userId)
        .single();

      if (userError || !userData) throw new InternalServerErrorException('Error fetching user profile');

      if (userData.status === 'pending' || userData.status === 'rejected') {
        await supabase.auth.signOut();
        throw new UnauthorizedException({
          message: 'Access Denied: Provider account is not yet active.',
          current_status: userData.status,
        });
      }

      return {
        message: 'STATUS 200 OK',
        access_token: data.session?.access_token,
        user_id: data.user?.id,
        role: userData.role,
      };
    } catch (err) {
      console.error('Login Error:', err.message);
      throw new UnauthorizedException(err.response || err.message);
    }
  }

  async registerProvider(dto: RegisterProviderDto, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('document_file image is required');

    const { full_name, email, contact_number, password, role, business_name, document_type, date_of_birth } = dto;

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,128}$/;
    if (!passwordRegex.test(password)) {
      throw new BadRequestException(
        'Password must be 8-128 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.',
      );
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password, email_confirm: true } as any);
    if (authError) throw new BadRequestException(`Auth Registration Error: ${authError.message}`);

    const newUserId = authData.user?.id;
    if (!newUserId) throw new BadRequestException('Could not retrieve user ID from Supabase');

    const { error: userError } = await supabase
      .from('users')
      .insert([{ id: newUserId, full_name, email, contact_number, role, status: 'pending', is_verified: false, date_of_birth }]);

    if (userError) {
      await supabase.auth.admin.deleteUser(newUserId);
      throw new BadRequestException(`User Profile Error: ${userError.message}`);
    }

    const { data: profile, error: profileError } = await supabase
      .from('provider_profiles')
      .insert([{ user_id: newUserId, business_name, verification_status: 'pending' }])
      .select()
      .single();

    if (profileError) throw new BadRequestException(`Provider Profile Error: ${profileError.message}`);

    const filePath = `kyc/${newUserId}/${Date.now()}_${file.originalname}`;
    const { error: uploadError } = await supabase.storage
      .from('verification-docs')
      .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: false });

    if (uploadError) throw new BadRequestException(`Storage Upload Error: ${uploadError.message}`);

    const { error: docError } = await supabase
      .from('provider_documents')
      .insert([{ provider_id: newUserId, document_type, document_file_path: filePath, status: 'pending' }]);

    if (docError) throw new BadRequestException(`Document Link Error: ${docError.message}`);

    return {
      status: 'success',
      message: 'Provider application submitted. Pending approval.',
      data: {
        provider_id: newUserId,
        business_name: profile.business_name,
        verification_status: profile.verification_status,
      },
    };
  }
}
