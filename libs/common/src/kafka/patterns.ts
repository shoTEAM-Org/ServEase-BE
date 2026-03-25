// Request-response message patterns for gateway → microservice communication
export const AUTH_PATTERNS = {
  REGISTER_CUSTOMER: 'auth.register.customer',
  REGISTER_PROVIDER: 'auth.register.provider',
  LOGIN: 'auth.login',
  GET_PROFILE: 'auth.get.profile',
} as const;

export const BOOKING_PATTERNS = {
  CREATE: 'booking.create',
  GET_HISTORY: 'booking.get.history',
  GET_REQUESTS: 'booking.get.requests',
  UPDATE_STATUS: 'booking.update.status',
} as const;

export const PAYMENT_PATTERNS = {
  CREATE: 'payment.create',
  GET_EARNINGS: 'payment.get.earnings',
} as const;

export const PROVIDER_PATTERNS = {
  GET_BY_SERVICE: 'provider.get.by.service',
  SEARCH: 'provider.search',
  GET_PROFILE: 'provider.get.profile',
  GET_DASHBOARD: 'provider.get.dashboard',
  GET_TRUST_SCORE: 'provider.get.trust.score',
  GET_REVIEWS: 'provider.get.reviews',
  REUPLOAD_KYC: 'provider.reupload.kyc',
} as const;

export const CUSTOMER_PATTERNS = {
  GET_DASHBOARD: 'customer.get.dashboard',
} as const;

export const ADMIN_PATTERNS = {
  UPDATE_DOCUMENT_STATUS: 'admin.update.document.status',
} as const;

export const CATALOG_PATTERNS = {
  GET_ALL_SERVICES: 'catalog.get.all.services',
  SEARCH_SERVICES: 'catalog.search.services',
  GET_CATEGORIES: 'catalog.get.categories',
  GET_LOCATIONS: 'catalog.get.locations',
} as const;
