import { 
  Controller, Query, Patch, Get, Body, Param, UseInterceptors, UploadedFile, ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProviderService } from './provider.service';
import { ProviderDashboardResponseDto } from './dto/provider-dashboard.dto';
import { TrustScoreDto } from './dto/provider-trust-score.dto';
import { ProviderReviewsDto } from './dto/provider-reviews.dto';

@Controller('api/provider') 
export class ProviderController {
  constructor(private readonly providerService: ProviderService) {}

  @Get('v1/trust-score/:provider_id')
  async getTrustScore(@Param('provider_id') providerId: string):
  Promise<TrustScoreDto> {
    return this.providerService.getTrustScore(providerId);
  }

  @Get('v1/reviews/:id')
  async getProviderReviews(@Param('id', ParseUUIDPipe) id: string):
   Promise<ProviderReviewsDto> {
    return this.providerService.getProviderReviews(id);
   }
  
  @Get('v1')
  getProviders(
    @Query('serviceId')serviceId: string,
    @Query('search') search: string
  ) {
    if (search) {
      return this.providerService.searchMockProviders(search);
    }
    return this.providerService.getMockProvidersByService(Number(serviceId));
  }

  @Get('v1/:user_id')
  async getProfile(@Param('user_id') userId: string) {
    return this.providerService.getProviderProfile(userId);
  }

  @Get('v1/dashboard/:id')
  async getDashboard(
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<ProviderDashboardResponseDto> {
    return await this.providerService.getProviderDashboard(id);
  }

  @Patch('v1/kyc/reupload')
  @UseInterceptors(FileInterceptor('document_file'))
  async reuploadKyc(
    @Body('provider_id') providerId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.providerService.reuploadKycDocument(providerId, file);
  }
}