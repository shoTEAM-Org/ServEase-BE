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

  @MessagePattern(AUTH_PATTERNS.GET_USERS_BY_ROLE)
  async getUsersByRole(@Payload() data: any) {
    return this.usersService.getUsersByRole(
      data?.role,
      data?.page,
      data?.limit,
    );
  }

  @MessagePattern(AUTH_PATTERNS.GET_USERS_BY_IDS)
  async getUsersByIds(@Payload() data: any) {
    return this.usersService.getUsersByIds(data?.userIds);
  }

  @MessagePattern(AUTH_PATTERNS.GET_USER_REPORT)
  async getUserReport(@Payload() data: any) {
    return this.usersService.getUserReport(data?.from, data?.to);
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
    const { userId, ...updates } = data || {};
    return this.usersService.updateCustomerProfile(userId, updates);
  }

  @EventPattern(AUTH_PATTERNS.ADD_ADDRESS)
  async addAddress(@Payload() data: any) {
    const { userId, ...payload } = data || {};
    return this.usersService.addAddress(userId, payload);
  }

  @EventPattern(AUTH_PATTERNS.UPDATE_ADDRESS)
  async updateAddress(@Payload() data: any) {
    const { userId, addressId, ...payload } = data || {};
    try {
      return await this.usersService.updateAddress(addressId, userId, payload);
    } catch (err: any) {
      console.error('[auth-service] updateAddress failed:', {
        addressId,
        userId,
        payload,
        message: err?.message,
        code: err?.code,
        details: err?.response || err,
      });
      throw err;
    }
  }

  @EventPattern(AUTH_PATTERNS.DELETE_ADDRESS)
  async deleteAddress(@Payload() data: any) {
    return this.usersService.deleteAddress(data?.addressId, data?.userId);
  }

  @MessagePattern(AUTH_PATTERNS.UPDATE_USER_STATUS)
  async updateUserStatus(@Payload() data: any) {
    return this.usersService.updateUserStatus(data?.userId, data?.status);
  }
}
