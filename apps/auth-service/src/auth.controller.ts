import 'multer';
import { Controller, HttpException, Inject } from '@nestjs/common';
import { MessagePattern, EventPattern, Payload, RpcException } from '@nestjs/microservices';
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
    try {
      // Gateway pre-uploads the file and sends { filePath, originalname, mimetype }.
      // Pass data.file directly — auth.service.ts reads filePath from it.
      const file = data.file ?? null;
      return await this.authService.registerProvider(data, file!);
    } catch (error: any) {
      if (error instanceof HttpException) {
        const response = error.getResponse();
        const message =
          typeof response === 'object' && response && 'message' in response
            ? (response as { message: unknown }).message
            : error.message;
        throw new RpcException({
          statusCode: error.getStatus(),
          message,
        });
      }
      throw error;
    }
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

  @MessagePattern(AUTH_PATTERNS.GET_GOOGLE_OAUTH_URL)
  async getGoogleOAuthUrl(@Payload() data: any) {
    return this.authService.getGoogleOAuthUrl(data.redirectUri);
  }

  @MessagePattern(AUTH_PATTERNS.EXCHANGE_GOOGLE_CODE)
  async exchangeGoogleCode(@Payload() data: any) {
    return this.authService.exchangeGoogleCode(data.code, data.redirectUri, data.role);
  }

  @MessagePattern(AUTH_PATTERNS.OTP_SEND)
  async sendOtp(@Payload() data: any) {
    return this.authService.sendOtp(data.target, data.channel ?? 'sms');
  }

  @MessagePattern(AUTH_PATTERNS.OTP_VERIFY)
  async verifyPhoneOtp(@Payload() data: any) {
    return this.authService.verifyPhoneOtp(data.otpId, data.code, data.userId);
  }

  @MessagePattern(AUTH_PATTERNS.LOGIN_MFA_VERIFY)
  async verifyLoginMfa(@Payload() data: any) {
    return this.authService.verifyLoginMfa(data.otpId, data.code);
  }
}
