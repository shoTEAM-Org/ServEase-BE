import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register/customer')
  async register(@Body() createUserDto: any) {
    return this.authService.register(createUserDto);
  }

  @Post('login/customer')
  @HttpCode(200)
  async login(@Body() loginDto: any) {
    return this.authService.login(loginDto);
  }
}