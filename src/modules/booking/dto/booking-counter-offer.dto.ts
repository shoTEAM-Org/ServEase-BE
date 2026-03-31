import { IsString, IsNumber, IsIn, IsDateString } from 'class-validator';

export class ProviderCounterOfferDto {
  @IsDateString({}, { message: 'Proposed date and time must be a valid ISO string.' })
  scheduled_at: string;

  @IsNumber({}, { message: 'Proposed price must be a valid number.' })
  total_amount: number;

  @IsNumber({}, { message: 'Estimated duration must be a valid number (hours).' })
  hours_required: number;

  @IsString({ message: 'A reason for the counter offer is required.' })
  counter_offer_reason: string;

  @IsNumber()
  @IsIn([24, 48, 72], { message: 'Validity period must be 24, 48, or 72 hours.' })
  validity_hours: number;
}