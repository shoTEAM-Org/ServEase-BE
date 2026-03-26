import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PROVIDER_PATTERNS } from '@app/common';
import { ProviderService } from './provider.service';

@Controller()
export class ProviderController {
  constructor(private readonly providerService: ProviderService) {}

  @MessagePattern(PROVIDER_PATTERNS.GET_BY_SERVICE)
  async getByService(@Payload() data: { serviceId: number }) {
    return this.providerService.getMockProvidersByService(data.serviceId);
  }

  @MessagePattern(PROVIDER_PATTERNS.SEARCH)
  async search(@Payload() data: { search: string }) {
    return this.providerService.searchMockProviders(data.search);
  }

  @MessagePattern(PROVIDER_PATTERNS.GET_PROFILE)
  async getProfile(@Payload() data: { userId: string }) {
    return this.providerService.getProviderProfile(data.userId);
  }

  @MessagePattern(PROVIDER_PATTERNS.GET_DASHBOARD)
  async getDashboard(@Payload() data: { providerId: string }) {
    return this.providerService.getProviderDashboard(data.providerId);
  }

  @MessagePattern(PROVIDER_PATTERNS.GET_TRUST_SCORE)
  async getTrustScore(@Payload() data: { providerId: string }) {
    return this.providerService.getTrustScore(data.providerId);
  }

  @MessagePattern(PROVIDER_PATTERNS.GET_REVIEWS)
  async getReviews(@Payload() data: { providerId: string }) {
    return this.providerService.getProviderReviews(data.providerId);
  }

  @MessagePattern(PROVIDER_PATTERNS.REUPLOAD_KYC)
  async reuploadKyc(@Payload() data: { providerId: string; file: any }) {
    const multerFile = {
      originalname: data.file.originalname,
      mimetype: data.file.mimetype,
      buffer: Buffer.from(data.file.buffer, 'base64'),
    } as Express.Multer.File;
    return this.providerService.reuploadKycDocument(data.providerId, multerFile);
  }
}
