import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { supabase } from '@app/database';

@Injectable()
export class VerifiedProviderGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<any>();
    const user = request['user'];

    if (!user || String(user.role || '').trim() !== 'provider') {
      throw new ForbiddenException('Provider access required');
    }

    const { data: profile } = await supabase
      .schema('provider_catalog')
      .from('provider_profiles')
      .select('verification_status')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profile?.verification_status !== 'approved') {
      throw new ForbiddenException(
        'Your provider account must be verified and approved before you can perform this action.',
      );
    }

    return true;
  }
}
