import { IsNotEmpty, IsString } from 'class-validator';

export class CustomerGoogleLoginDto {
  @IsString()
  @IsNotEmpty()
  id_token: string;
}