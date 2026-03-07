import { IsEnum, IsString, IsOptional } from 'class-validator';

// SCRUM-55: KYC Document Approval/Rejection
// Developer: alex cadaoas
export enum DocumentStatus {
  APPROVED = 'approved',
  REJECTED = 'rejected',
  PENDING = 'pending'
}

export class UpdateDocumentStatusDto {
  @IsEnum(DocumentStatus)
  status: DocumentStatus;

  @IsString()
  @IsOptional()
  remarks?: string; // Optional notes for rejection reason
}
