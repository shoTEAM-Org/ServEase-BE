import { 
  Controller, Patch, Get, Body, Param, UseInterceptors, UploadedFile, ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProviderService } from './provider.service';
import { ProviderDashboardResponseDto } from './dto/provider-dashboard.dto';

@Controller('api/provider') 
export class ProviderController {
  constructor(private readonly providerService: ProviderService) {}

  

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