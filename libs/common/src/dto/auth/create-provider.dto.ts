import {
  IsEmail,
  IsString,
  IsEnum,
  MinLength,
  IsNotEmpty,
} from 'class-validator';

export enum DocumentType {
  PERMIT = 'business_permit',
  GOVERNMENT_ID = 'government_id',
  CERTIFICATION = 'certification',
}

export class RegisterProviderDto {
  @IsString()
  @IsNotEmpty()
  full_name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  contact_number: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string;

  @IsString()
  @IsNotEmpty()
  role: string;

  @IsString()
  @IsNotEmpty()
  business_name: string;

  @IsEnum(DocumentType, { message: 'Invalid document_type' })
  document_type: DocumentType;

  @IsString()
  @IsNotEmpty()
  date_of_birth: string;
}
