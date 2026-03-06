import { 
  Controller, Post, Get, Body, Param, UseInterceptors, UploadedFile, 
  ParseFilePipe, MaxFileSizeValidator, FileTypeValidator 
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProviderService } from './provider.service';
import { RegisterProviderDto } from './dto/register-provider.dto';

@Controller('api/v1/auth') 
export class ProviderController {
  constructor(private readonly providerService: ProviderService) {}

  @Post('register/provider')
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
}