export class TrustScoreDataDto {
  provider_id: string;
  trust_score: number;
}

export class TrustScoreDto {
  status: string;
  data: TrustScoreDataDto;
}