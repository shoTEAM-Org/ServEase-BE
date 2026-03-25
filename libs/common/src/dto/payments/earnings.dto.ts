export class EarningsDataDto {
  provider_id: string;
  total_earnings: number;
}

export class EarningsDto {
  status: string;
  data: EarningsDataDto;
}
