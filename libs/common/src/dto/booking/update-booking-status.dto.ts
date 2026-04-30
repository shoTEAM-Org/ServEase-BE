import { IsEnum } from 'class-validator';

export enum BookingStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  DISPUTED = 'disputed',
}

export class UpdateBookingStatusDto {
  @IsEnum(BookingStatus, {
    message: `Status must be one of: ${Object.values(BookingStatus).join(', ')}`,
  })
  status: BookingStatus;
}

export class ProviderBookingResponseDto {
  @IsEnum([BookingStatus.CONFIRMED, BookingStatus.CANCELLED], {
    message: 'Provider can only respond with Confirmed or Cancelled.',
  })
  status: BookingStatus;
}
