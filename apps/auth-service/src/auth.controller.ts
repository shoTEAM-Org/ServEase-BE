import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AUTH_PATTERNS } from '@app/common';
import { AuthService } from './auth.service.js';
import { UsersService } from './users.service.js';

@Controller()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @MessagePattern(AUTH_PATTERNS.REGISTER_CUSTOMER)
  async registerCustomer(@Payload() dto: any) {
    return this.authService.register(dto);
  }

  @MessagePattern(AUTH_PATTERNS.LOGIN)
  async login(@Payload() dto: any) {
    return this.authService.login(dto);
  }

  @MessagePattern(AUTH_PATTERNS.REGISTER_PROVIDER)
  async registerProvider(@Payload() data: any) {
    const { file, ...dto } = data;
    const multerFile = {
      originalname: file.originalname,
      mimetype: file.mimetype,
      buffer: Buffer.from(file.buffer, 'base64'),
    } as Express.Multer.File;
    return this.authService.registerProvider(dto, multerFile);
  }

  @MessagePattern(AUTH_PATTERNS.GET_PROFILE)
  async getProfile(@Payload() data: { userId: string }) {
    return this.usersService.getProfile(data.userId);
  }
}
