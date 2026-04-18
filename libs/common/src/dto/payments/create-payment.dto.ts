import {
  IsIn,
  IsNumber,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class CreatePaymentDto {
  @IsUUID()
  @IsNotEmpty()
  booking_id: string;

  @IsUUID()
  @IsNotEmpty()
  customer_id: string;

  @IsUUID()
  @IsNotEmpty()
  provider_id: string;

  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @IsString()
  @IsNotEmpty()
  method: string;

  @IsString()
  @IsOptional()
  @IsIn(['pending', 'completed', 'failed', 'refunded'])
  status?: string;

  @IsString()
  @IsOptional()
  transaction_reference?: string;
}
