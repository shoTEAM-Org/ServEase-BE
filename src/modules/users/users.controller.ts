import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { UserProfileDto } from './dto/user-profile.dto';

@Controller('api/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('/v1/profile')
  @UseGuards(SupabaseAuthGuard)
  async getProfile(@Req() req: any): Promise<UserProfileDto> {
    const userId = req.user.id;
    return this.usersService.getProfile(userId);
  }
}