import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateDocumentStatusDto {
  @IsEnum(['approved', 'rejected'])
  @IsNotEmpty()
  status: 'approved' | 'rejected';

  @IsString()
  @IsOptional()
  reject_reason?: string;

  @IsUUID()
  @IsOptional()
  admin_id?: string;
}