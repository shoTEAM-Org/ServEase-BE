import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { UserProfileDto } from '@app/common';

@Injectable()
export class UsersService {
  constructor(private readonly supabase: SupabaseClient) {}

  async getProfile(userId: string): Promise<UserProfileDto> {
    const { data, error } = await this.supabase
      .from('users')
      .select('id, full_name, email, contact_number, role, status')
      .eq('id', userId)
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException('User not found');

    return data;
  }
}
