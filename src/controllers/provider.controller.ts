import { Controller, Get, Patch, Query, Param, Body, Inject, OnModuleInit,
         ParseUUIDPipe, UseInterceptors, UploadedFile } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { FileInterceptor } from '@nestjs/platform-express';
import { lastValueFrom } from 'rxjs';
import { PROVIDER_PATTERNS } from '@app/common';
import 'multer';

@Controller('api/provider')
export class ProviderController implements OnModuleInit {
  constructor(@Inject('PROVIDER_SERVICE') private readonly providerClient: ClientKafka) {}

  async onModuleInit() {
    this.providerClient.subscribeToResponseOf(PROVIDER_PATTERNS.GET_BY_SERVICE);
    this.providerClient.subscribeToResponseOf(PROVIDER_PATTERNS.SEARCH);
    this.providerClient.subscribeToResponseOf(PROVIDER_PATTERNS.GET_PROFILE);
    this.providerClient.subscribeToResponseOf(PROVIDER_PATTERNS.GET_DASHBOARD);
    this.providerClient.subscribeToResponseOf(PROVIDER_PATTERNS.GET_TRUST_SCORE);
    this.providerClient.subscribeToResponseOf(PROVIDER_PATTERNS.GET_REVIEWS);
    this.providerClient.subscribeToResponseOf(PROVIDER_PATTERNS.REUPLOAD_KYC);
    await this.providerClient.connect();
  }

  @Get('v1/trust-score/:provider_id')
  async getTrustScore(@Param('provider_id') providerId: string) {
    return lastValueFrom(this.providerClient.send(PROVIDER_PATTERNS.GET_TRUST_SCORE, { providerId }));
  }

  @Get('v1/reviews/:id')
  async getProviderReviews(@Param('id', ParseUUIDPipe) id: string) {
    return lastValueFrom(this.providerClient.send(PROVIDER_PATTERNS.GET_REVIEWS, { providerId: id }));
  }

  @Get('v1')
  async getProviders(@Query('serviceId') serviceId: string, @Query('search') search: string) {
    if (search) {
      return lastValueFrom(this.providerClient.send(PROVIDER_PATTERNS.SEARCH, { search }));
    }
    return lastValueFrom(this.providerClient.send(PROVIDER_PATTERNS.GET_BY_SERVICE, { serviceId: Number(serviceId) }));
  }

  @Get('v1/:user_id')
  async getProfile(@Param('user_id') userId: string) {
    return lastValueFrom(this.providerClient.send(PROVIDER_PATTERNS.GET_PROFILE, { userId }));
  }

  @Get('v1/dashboard/:id')
  async getDashboard(@Param('id', ParseUUIDPipe) id: string) {
    return lastValueFrom(this.providerClient.send(PROVIDER_PATTERNS.GET_DASHBOARD, { providerId: id }));
  }

  @Patch('v1/kyc/reupload')
  @UseInterceptors(FileInterceptor('document_file'))
  async reuploadKyc(@Body('provider_id') providerId: string, @UploadedFile() file: Express.Multer.File) {
    const payload = {
      providerId,
      file: {
        originalname: file.originalname,
        mimetype: file.mimetype,
        buffer: file.buffer.toString('base64'),
      },
    };
    return lastValueFrom(this.providerClient.send(PROVIDER_PATTERNS.REUPLOAD_KYC, payload));
  }
}
