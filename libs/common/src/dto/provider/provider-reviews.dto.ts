export class ReviewItemDto {
  id: string;
  reviewer_id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
}

export class ProviderReviewsDataDto {
  provider_id: string;
  average_rating: number;
  total_reviews: number;
  reviews: ReviewItemDto[];
}

export class ProviderReviewsDto {
  status: string;
  data: ProviderReviewsDataDto;
}
