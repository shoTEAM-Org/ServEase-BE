import { IsString, IsEnum, IsOptional } from 'class-validator';

export enum CancellationReason {
  SCHEDULE_CONFLICT = 'Schedule conflict',
  EMERGENCY = 'Emergency',
  CUSTOMER_REQUEST = 'Customer request',
  UNABLE_TO_FULFILL = 'Unable to fulfill service',
  LOCATION_TOO_FAR = 'Location too far',
  WEATHER = 'Weather conditions',
  HEALTH = 'Health issues',
  OTHERS = 'Others',
}

export class CancelBookingDto {
  @IsEnum(CancellationReason, { message: 'Please select a valid cancellation reason.' })
  reason: CancellationReason;

  @IsOptional()
  @IsString()
  detailed_explanation?: string;
}