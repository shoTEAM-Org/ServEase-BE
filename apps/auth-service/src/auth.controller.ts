import 'multer';
import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, EventPattern, Payload } from '@nestjs/microservices';
import { AUTH_PATTERNS } from '@app/common';
import { AuthService } from './auth.service.js';
import { UsersService } from './users.service.js';

@Controller()
export class AuthKafkaController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(UsersService) private readonly usersService: UsersService,
  ) {}

  @MessagePattern(AUTH_PATTERNS.REGISTER_CUSTOMER)
  async registerCustomer(@Payload() data: any) {
    return this.authService.register(data);
  }

  @MessagePattern(AUTH_PATTERNS.LOGIN)
  async login(@Payload() data: any) {
    return this.authService.login(data);
  }

  @MessagePattern(AUTH_PATTERNS.REGISTER_PROVIDER)
  async registerProvider(@Payload() data: any) {
    const file = data.file
      ? ({ ...data.file, buffer: Buffer.from(data.file.buffer, 'base64') } as Express.Multer.File)
      : null;
    return this.authService.registerProvider(data, file!);

  }

  @MessagePattern(AUTH_PATTERNS.REFRESH)
  async refresh(@Payload() data: any) {
    return this.authService.refreshSession(data.refresh_token);
  }

  @MessagePattern(AUTH_PATTERNS.GET_ME)
  async getMe(@Payload() data: any) {
    return this.authService.getCurrentUser(data.userId);
  }

  @MessagePattern(AUTH_PATTERNS.GET_PROFILE)
  async getProfile(@Payload() data: any) {
    return this.usersService.getProfile(data.userId);
  }

  @MessagePattern(AUTH_PATTERNS.GET_CUSTOMER_PROFILE)
  async getCustomerProfile(@Payload() data: any) {
    return this.usersService.getCustomerProfile(data.userId);
  }

  @MessagePattern(AUTH_PATTERNS.GET_ADDRESSES)
  async getAddresses(@Payload() data: any) {
    return this.usersService.getAddresses(data.userId);
  }

  @EventPattern(AUTH_PATTERNS.LOGOUT)
  async logout(@Payload() data: any) {
    return this.authService.logout(data.accessToken);
  }

  @EventPattern(AUTH_PATTERNS.FORGOT_PASSWORD)
  async forgotPassword(@Payload() data: any) {
    return this.authService.requestPasswordReset(data.email, data.redirect_to);
  }

  @EventPattern(AUTH_PATTERNS.RESET_PASSWORD)
  async resetPassword(@Payload() data: any) {
    return this.authService.resetPassword(data);
  }

  @EventPattern(AUTH_PATTERNS.UPDATE_PROFILE)
  async updateProfile(@Payload() data: any) {
    return this.usersService.updateProfile(data.userId, data);
  }

  @EventPattern(AUTH_PATTERNS.UPDATE_CUSTOMER_PROFILE)
  async updateCustomerProfile(@Payload() data: any) {
    return this.usersService.updateCustomerProfile(data.userId, data);
  }

  @EventPattern(AUTH_PATTERNS.ADD_ADDRESS)
  async addAddress(@Payload() data: any) {
    const { userId, ...payload } = data || {};
    return this.usersService.addAddress(userId, payload);
  }

  @EventPattern(AUTH_PATTERNS.UPDATE_ADDRESS)
  async updateAddress(@Payload() data: any) {
    const { userId, addressId, ...payload } = data || {};
    return this.usersService.updateAddress(addressId, userId, payload);
  }

  @EventPattern(AUTH_PATTERNS.DELETE_ADDRESS)
  async deleteAddress(@Payload() data: any) {
    return this.usersService.deleteAddress(data?.addressId, data?.userId);
  }
}
