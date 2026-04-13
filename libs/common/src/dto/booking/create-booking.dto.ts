import { IsString, IsNotEmpty, IsNumber, IsDateString } from 'class-validator';

export class CreateBookingDto {
  @IsString()
  @IsNotEmpty()
  provider_id: string;

  @IsString()
  @IsNotEmpty()
  service_id: string;

  @IsString()
  @IsNotEmpty()
  service_address: string;

  @IsDateString()
  @IsNotEmpty()
  scheduled_at: string;

  @IsNumber()
  @IsNotEmpty()
  hourly_rate: number;

  @IsNumber()
  @IsNotEmpty()
  hours_required: number;
}
