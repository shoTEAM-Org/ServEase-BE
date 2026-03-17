import { IsNotEmpty, IsString } from 'class-validator';

export class ProviderGoogleLoginDto {
  @IsString()
  @IsNotEmpty()
  id_token: string;
}