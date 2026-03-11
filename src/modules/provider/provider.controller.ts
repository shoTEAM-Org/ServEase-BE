import { 
  Controller, Post, Patch, Get, Body, Param, UseInterceptors, UploadedFile, 
  ParseFilePipe, MaxFileSizeValidator, FileTypeValidator, ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProviderService } from './provider.service';
import { RegisterProviderDto } from './dto/register-provider.dto';
import { ProviderDashboardResponseDto } from './dto/provider-dashboard.dto';

@Controller('api/provider') 
export class ProviderController {
  constructor(private readonly providerService: ProviderService) {}

  @Post('v2/register')
  @UseInterceptors(FileInterceptor('document_file')) 
  async register(
    @Body() dto: RegisterProviderDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), 
          new FileTypeValidator({ fileType: 'image/(jpeg|jpg|png)' }), 
        ],
      }),
    ) file: Express.Multer.File,
  ) {
    return this.providerService.registerProvider(dto, file);
  }

  @Get(':user_id')
  async getProfile(@Param('user_id') userId: string) {
    return this.providerService.getProviderProfile(userId);
  }

  @Get(':id/dashboard')
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