import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { supabase } from '@app/database';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedException('No authorization token provided');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new UnauthorizedException('Invalid authorization header format');
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const { data: userRecord, error: userError } = await supabase
      .schema('identity_and_user')
      .from('users')
      .select('id, role, status, full_name, email, contact_number')
      .eq('id', data.user.id)
      .maybeSingle();

    if (userError || !userRecord) {
      throw new UnauthorizedException('User account not found');
    }

    const normalizedStatus = String(userRecord.status || '').trim().toLowerCase();
    if (normalizedStatus === 'suspended' || normalizedStatus === 'inactive') {
      throw new UnauthorizedException({
        message: 'Access Denied: Account is not active.',
        current_status: normalizedStatus,
      });
    }

    request['user'] = {
      ...data.user,
      role: userRecord.role,
      status: userRecord.status,
      full_name: userRecord.full_name,
      email: userRecord.email,
      contact_number: userRecord.contact_number,
    };
    return true;
  }
}
