import { Injectable, UnauthorizedException, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { supabase } from '../../../src/config/supabaseClient'; 
import { RegisterProviderDto } from '../auth/dto/create-provider.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { CustomerGoogleLoginDto } from './dto/customer-google-login.dto';
import { ProviderGoogleLoginDto } from './dto/provider-google-login.dto';
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
      const userId = authData.user.id;

      
      const { error: userTableError } = await supabase
        .from('users') 
        .insert([
          { 
            id: userId, 
            role: dto.role || 'customer',
            full_name: dto.full_name,
            email: dto.email,
            contact_number: dto.contact_number 
          }
        ]);

      if (userTableError) throw new Error(`Users Table Error: ${userTableError.message}`);

      
      const { error: profileError } = await supabase
        .from('customer_profiles')
        .insert([
          { 
            user_id: userId, 
            address: dto.address 
          }
        ]);

      if (profileError) throw new Error(`Profile Table Error: ${profileError.message}`);

      return { 
        status: 201, 
        message: 'Registration Successful. Data inserted in all tables.', 
        userId 
      };

    } catch (err) {
      console.error('Registration Crash:', err.message);
      throw new InternalServerErrorException(err.message);
    }
  }

  async login(loginDto: LoginUserDto) {
    try {
      const email = loginDto.email; 
      const password = loginDto.password;

      const isEmail = email.includes('@');
      let loginEmail = email;

      if (!isEmail) {
        const { data: userRecord, error: dbError } = await supabase
          .from('users')
          .select('email')
          .eq('contact_number', email)
          .single(); 

        if (dbError || !userRecord) {
          throw new UnauthorizedException('Phone number not registered.');
        }
        loginEmail = userRecord.email;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: password,
      });

      if (error) throw new UnauthorizedException('Invalid Credentials');


      const userId = data.user?.id;
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('role, status')
        .eq('id', userId)
        .single();

      if (userError || !userData) {
        throw new InternalServerErrorException('Error fetching user profile');
      }

      if (userData.status === 'pending' || userData.status === 'rejected') {
         await supabase.auth.signOut(); 
         throw new UnauthorizedException({
           message: 'Access Denied: Provider account is not yet active.',
           current_status: userData.status
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
  
      const { 
        full_name, email, contact_number, password, role, 
        business_name, document_type, date_of_birth,
      } = dto;
  
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,128}$/;
      if (!passwordRegex.test(password)) {
        throw new BadRequestException(
          'Password must be 8-128 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.'
        );
      }
  
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password, 
        email_confirm: true 
      });
  
      if (authError) throw new BadRequestException(`Auth Registration Error: ${authError.message}`);
  
      const newUserId = authData.user?.id;
      if (!newUserId) throw new BadRequestException('Could not retrieve user ID from Supabase');
      
      const { error: userError } = await supabase
        .from('users')
        .insert([{
          id: newUserId, 
          full_name,
          email,
          contact_number,
          role,
          status: 'pending',
          is_verified: false,
          date_of_birth 
        }]);
  
      if (userError) {
        await supabase.auth.admin.deleteUser(newUserId);
        throw new BadRequestException(`User Profile Error: ${userError.message}`);
      }
  
      const { data: profile, error: profileError } = await supabase
        .from('provider_profiles')
        .insert([{
          user_id: newUserId,
          business_name,
          verification_status: 'pending'
        }])
        .select()
        .single();
  
      if (profileError) throw new BadRequestException(`Provider Profile Error: ${profileError.message}`);
      
      const filePath = `kyc/${newUserId}/${Date.now()}_${file.originalname}`;
      const { error: uploadError } = await supabase.storage
        .from('verification-docs')
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false
        });
  
      if (uploadError) throw new BadRequestException(`Storage Upload Error: ${uploadError.message}`);
  
      const { error: docError } = await supabase
        .from('provider_documents')
        .insert([{
          provider_id: newUserId,
          document_type,
          document_file_path: filePath,
          status: 'pending'
        }]);
  
      if (docError) throw new BadRequestException(`Document Link Error: ${docError.message}`);
  
      return {
        status: "success",
        message: "Provider application submitted. Pending approval.",
        data: {
          provider_id: newUserId,
          business_name: profile.business_name,
          verification_status: profile.verification_status
        }
      };
  }

  //Google Auth Login for Customers and Providers
  async googleLoginCustomer(dto: CustomerGoogleLoginDto) {
    try {
      // 1. Verify the Google ID token and get/create a Supabase auth user
      const { data: authData, error: authError } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: dto.id_token,
      });

      if (authError) throw new UnauthorizedException(`Google Auth Error: ${authError.message}`);

      const userId = authData.user.id;
      const email = authData.user.email;
      const fullName = authData.user.user_metadata?.full_name || authData.user.user_metadata?.name || '';

      // 2. Check if this user already exists in the users table
      const { data: existingUser, error: lookupError } = await supabase
        .from('users')
        .select('id, role, status')
        .eq('id', userId)
        .single();

      // User exists — return their session
      if (existingUser) {
        if (existingUser.role !== 'customer') {
          throw new UnauthorizedException('This Google account is registered as a provider. Please use the provider login.');
        }

        return {
          message: 'STATUS 200 OK',
          access_token: authData.session?.access_token,
          user_id: userId,
          role: existingUser.role,
        };
      }

      // 3. New user — auto-create rows in users + customer_profiles
      const { error: userTableError } = await supabase
        .from('users')
        .insert([{
          id: userId,
          email,
          full_name: fullName,
          role: 'customer',
          status: 'active',
        }]);

      if (userTableError) throw new InternalServerErrorException(`Users Table Error: ${userTableError.message}`);

      const { error: profileError } = await supabase
        .from('customer_profiles')
        .insert([{ user_id: userId }]);

      if (profileError) throw new InternalServerErrorException(`Customer Profile Error: ${profileError.message}`);

      return {
        message: 'STATUS 201 CREATED',
        access_token: authData.session?.access_token,
        user_id: userId,
        role: 'customer',
      };

    } catch (err) {
      console.error('Google Customer Login Error:', err.message);
      if (err instanceof UnauthorizedException || err instanceof InternalServerErrorException) throw err;
      throw new UnauthorizedException(err.message);
    }
  }

  async googleLoginProvider(dto: ProviderGoogleLoginDto) {
    try {
      // 1. Verify the Google ID token and get/create a Supabase auth user
      const { data: authData, error: authError } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: dto.id_token,
      });

      if (authError) throw new UnauthorizedException(`Google Auth Error: ${authError.message}`);

      const userId = authData.user.id;
      const email = authData.user.email;
      const fullName = authData.user.user_metadata?.full_name || authData.user.user_metadata?.name || '';

      // 2. Check if this user already exists in the users table
      const { data: existingUser, error: lookupError } = await supabase
        .from('users')
        .select('id, role, status')
        .eq('id', userId)
        .single();

      // User exists — return their session
      if (existingUser) {
        if (existingUser.role !== 'provider') {
          throw new UnauthorizedException('This Google account is registered as a customer. Please use the customer login.');
        }

        if (existingUser.status === 'pending' || existingUser.status === 'rejected') {
          throw new UnauthorizedException({
            message: 'Access Denied: Provider account is not yet active.',
            current_status: existingUser.status,
          });
        }

        return {
          message: 'STATUS 200 OK',
          access_token: authData.session?.access_token,
          user_id: userId,
          role: existingUser.role,
        };
      }

      // 3. New user — auto-create rows in users + provider_profiles
      //    Provider starts as 'pending' since they still need KYC verification
      const { error: userTableError } = await supabase
        .from('users')
        .insert([{
          id: userId,
          email,
          full_name: fullName,
          role: 'provider',
          status: 'pending',
          is_verified: false,
        }]);

      if (userTableError) throw new InternalServerErrorException(`Users Table Error: ${userTableError.message}`);

      const { error: profileError } = await supabase
        .from('provider_profiles')
        .insert([{
          user_id: userId,
          verification_status: 'pending',
        }]);

      if (profileError) throw new InternalServerErrorException(`Provider Profile Error: ${profileError.message}`);

      return {
        message: 'STATUS 201 CREATED',
        access_token: authData.session?.access_token,
        user_id: userId,
        role: 'provider',
        note: 'Provider account created. KYC verification is still required.',
      };

    } catch (err) {
      console.error('Google Provider Login Error:', err.message);
      if (err instanceof UnauthorizedException || err instanceof InternalServerErrorException) throw err;
      throw new UnauthorizedException(err.message);
    }
  }
}