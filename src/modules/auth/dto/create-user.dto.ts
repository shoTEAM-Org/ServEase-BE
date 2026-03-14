import { IsEmail, IsString, IsOptional, IsStrongPassword } from 'class-validator';

export class CreateUserDto {
  @IsString()
  full_name: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsStrongPassword({
    minLength: 8,
    minLowercase: 1,
    minUppercase: 1,
    minNumbers: 1,
    minSymbols: 1,
  }, {
    message: 'Password is too weak. It must be at least 8 characters long, and include an uppercase letter, a lowercase letter, a number, and a special symbol.'
  })
  password: string;

  @IsString()
  contact_number: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  role?: 'customer' | 'provider' | 'admin';
}