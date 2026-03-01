import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth') // Appends to the global prefix -> /api/v1/auth
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register/customer') // Appends to controller -> /api/v1/auth/register/customer
  async register(@Body() dto: any) {
    return this.authService.register(dto);
  }

  @Post('login/customer')
  @HttpCode(200)
  async login(@Body() dto: any) {
    return this.authService.login(dto);
  }
}