import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupportService {
  constructor(private readonly supabase: SupabaseClient) {}

  async createTicket(
    userId: string,
    body: { subject: string; message: string; category?: string; role?: string },
  ) {
    const { data, error } = await this.supabase
      .schema('notification_and_support')
      .from('support_tickets')
      .insert([
        {
          user_id: userId,
          subject: body.subject,
          message: body.message,
          status: 'open',
        },
      ])
      .select()
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return { ticket: data };
  }
}
