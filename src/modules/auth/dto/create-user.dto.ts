import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

export class CreateUserDto {
  @IsString()
  full_name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  contact_number: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  role?: 'customer' | 'provider' | 'admin';
}