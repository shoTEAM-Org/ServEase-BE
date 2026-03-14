import { Controller, Post, Body, HttpCode, ParseFilePipe, MaxFileSizeValidator, 
         FileTypeValidator, UseInterceptors, UploadedFile} from '@nestjs/common';
import { AuthService } from './auth.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { RegisterProviderDto } from '../auth/dto/create-provider.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import 'multer';

@Controller('api/v2/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register/customer')
  async register(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto);
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() loginDto: LoginUserDto) {
    return this.authService.login(loginDto);
  }

  @Post('v2/register')
  @UseInterceptors(FileInterceptor('document_file')) 
  async registerProvider(
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
    return this.authService.registerProvider(dto, file);
  }
}