export class ProviderDetailsDto {
  full_name: string;
  contact_number: string;
  business_name: string;
  total_reviews: number;
  average_rating: number;
}

export class CustomerDashboardResponseDto {
  id: string;
  booking_reference: string;
  status: string;
  scheduled_at: string;
  total_amount: number;
  created_at: string;
  updated_at: string;
  provider: ProviderDetailsDto;
}
