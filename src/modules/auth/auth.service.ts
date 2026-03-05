import { Injectable, UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import { supabase } from '../../../src/config/supabaseClient'; 

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

  async login(loginDto: any) {
    try {
    
      const identifier = loginDto.email; 
      const password = loginDto.password;

      const isEmail = identifier.includes('@');
      let loginEmail = identifier;

      if (!isEmail) {
        const { data: userRecord, error: dbError } = await supabase
          .from('users')
          .select('email')
          .eq('contact_number', identifier)
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

      return {
        message: 'STATUS 200 OK',
        access_token: data.session?.access_token,
        user_id: data.user?.id,
      };

    } catch (err) {
      console.error('Login Error:', err.message);
      throw new UnauthorizedException(err.message); 
    }
  }
}