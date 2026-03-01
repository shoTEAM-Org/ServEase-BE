import { Injectable, UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import { supabase } from '../../../src/config/supabaseClient'; 

@Injectable()
export class AuthService {
  async register(dto: any) {
    try {
      // Step 1: Create the Identity in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: dto.email,
        password: dto.password,
      });

      if (authError) throw new Error(`Auth Error: ${authError.message}`);
      const userId = authData.user.id;

      // Step 2: Insert into 'users' table (satisfies the Foreign Key)
      // Matches columns: id, role, full_name, email, contact_number
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

      // Step 3: Insert into 'customer_profiles' table
      // Matches columns: user_id, address
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
    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginDto.email,
      password: loginDto.password,
    });

    if (error) throw new UnauthorizedException('Invalid Credentials');

    return {
      message: 'STATUS 200 OK',
      access_token: data.session?.access_token,
      user_id: data.user?.id,
    };
  }
}