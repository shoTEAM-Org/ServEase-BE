import { Controller, Post, Body, HttpCode, Inject, OnModuleInit,
         UseInterceptors, UploadedFile, ParseFilePipe, MaxFileSizeValidator, FileTypeValidator } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { FileInterceptor } from '@nestjs/platform-express';
import { lastValueFrom } from 'rxjs';
import { CreateUserDto, RegisterProviderDto, LoginUserDto, AUTH_PATTERNS } from '@app/common';
import 'multer';

@Controller('api/auth')
export class AuthController implements OnModuleInit {
  constructor(@Inject('AUTH_SERVICE') private readonly authClient: ClientKafka) {}

  async onModuleInit() {
    this.authClient.subscribeToResponseOf(AUTH_PATTERNS.REGISTER_CUSTOMER);
    this.authClient.subscribeToResponseOf(AUTH_PATTERNS.LOGIN);
    this.authClient.subscribeToResponseOf(AUTH_PATTERNS.REGISTER_PROVIDER);
    await this.authClient.connect();
  }

  @Post('v1/register/customer')
  async register(@Body() dto: CreateUserDto) {
    return lastValueFrom(this.authClient.send(AUTH_PATTERNS.REGISTER_CUSTOMER, dto));
  }

  @Post('v1/login')
  @HttpCode(200)
  async login(@Body() dto: LoginUserDto) {
    return lastValueFrom(this.authClient.send(AUTH_PATTERNS.LOGIN, dto));
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
    const payload = {
      ...dto,
      file: {
        originalname: file.originalname,
        mimetype: file.mimetype,
        buffer: file.buffer.toString('base64'),
      },
    };
    return lastValueFrom(this.authClient.send(AUTH_PATTERNS.REGISTER_PROVIDER, payload));
  }
}
