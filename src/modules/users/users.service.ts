import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import {LoginUserDto} from "./dto/login-user.dto";

@Injectable()
export class UsersService {
    private supabase = createClient(
        process.env.SUPABASE_URL || 'placeholder_url',
        process.env.SUPABASE_ANON_KEY || 'placeholder_key'   
    );

    async login(loginDto: LoginUserDto) {
        const { email, password } = loginDto;

  // 1. Ask Supabase Auth to verify the credentials 🔐
  const { data, error } = await this.supabase.auth.signInWithPassword({
    email,
    password,
  });

  // 2. Handle errors (like wrong password or email not found) 🛑
  if (error) {
    throw new UnauthorizedException('Invalid credentials');
  }

  // 3. Return the user and session (which includes the JWT!) ✅
  return {
    message: "Login successful!",
    user: data.user,
    session: data.session
  };
    }

}