export const AUTH_PATTERNS = {
  REGISTER_CUSTOMER: 'auth.register.customer',
  LOGIN: 'auth.login',
  REGISTER_PROVIDER: 'auth.register.provider',
  REFRESH: 'auth.refresh',
  GET_ME: 'auth.me',
  LOGOUT: 'auth.logout',
  FORGOT_PASSWORD: 'auth.forgot-password',
  RESET_PASSWORD: 'auth.reset-password',
  GET_PROFILE: 'users.get-profile',
  UPDATE_PROFILE: 'users.update-profile',
  GET_CUSTOMER_PROFILE: 'users.get-customer-profile',
  UPDATE_CUSTOMER_PROFILE: 'users.update-customer-profile',
  GET_ADDRESSES: 'users.get-addresses',
  ADD_ADDRESS: 'users.add-address',
  UPDATE_ADDRESS: 'users.update-address',
  DELETE_ADDRESS: 'users.delete-address',
} as const;

export const BOOKING_PATTERNS = {
  CREATE: 'booking.create',
  GET_CUSTOMER_BOOKINGS: 'booking.get-customer',
  GET_HISTORY: 'booking.get-history',
  GET_REQUESTS: 'booking.get-requests',
  GET_BY_ID: 'booking.get-by-id',
  UPDATE_STATUS: 'booking.update-status',
  CANCEL: 'booking.cancel',
  GET_ATTACHMENTS: 'booking.get-attachments',
  SAVE_ATTACHMENTS: 'booking.save-attachments',
  CREATE_DISPUTE: 'booking.create-dispute',
} as const;

export const CHAT_PATTERNS = {
  GET_CONVERSATIONS: 'chat.get-conversations',
  GET_MESSAGES: 'chat.get-messages',
  SEND_MESSAGE: 'chat.send-message',
  MARK_READ: 'chat.mark-read',
} as const;

export const PAYMENT_PATTERNS = {
  CREATE: 'payment.create',
  GET_EARNINGS: 'payment.get-earnings',
  GET_BY_BOOKING: 'payment.get-by-booking',
  GET_PROVIDER_HISTORY: 'payment.get-provider-history',
  GET_EARNINGS_SUMMARY: 'payment.get-earnings-summary',
  ENSURE_BOOKING_PAYMENT: 'payment.ensure-booking',
  MARK_PAID: 'payment.mark-paid',
  CANCEL_BOOKING_PAYMENT: 'payment.cancel-booking',
  UPDATE_AMOUNT: 'payment.update-amount',
} as const;

export const PROVIDER_PATTERNS = {
  GET_BY_SERVICE: 'provider.get-by-service',
  SEARCH: 'provider.search',
  GET_PROFILE: 'provider.get-profile',
  GET_DASHBOARD: 'provider.get-dashboard',
  GET_TRUST_SCORE: 'provider.get-trust-score',
  GET_REVIEWS: 'provider.get-reviews',
  REUPLOAD_KYC: 'provider.reupload-kyc',
  GET_BOOKINGS: 'provider.get-bookings',
  GET_BOOKING_BY_ID: 'provider.get-booking-by-id',
  UPDATE_BOOKING_STATUS: 'provider.update-booking-status',
  GET_AVAILABILITY: 'provider.get-availability',
  SAVE_AVAILABILITY: 'provider.save-availability',
  GET_RESERVED_SLOTS: 'provider.get-reserved-slots',
  CHECK_AVAILABILITY: 'provider.check-availability',
  GET_MY_SERVICES: 'provider.get-my-services',
  CREATE_MY_SERVICE: 'provider.create-my-service',
  UPDATE_MY_SERVICE: 'provider.update-my-service',
  DELETE_MY_SERVICE: 'provider.delete-my-service',
  GET_PROFILE_DRAFT: 'provider.get-profile-draft',
  SAVE_PROFILE_DRAFT: 'provider.save-profile-draft',
  CREATE_RESCHEDULE: 'provider.create-reschedule',
  GET_RESCHEDULES: 'provider.get-reschedules',
  REVIEW_RESCHEDULE: 'provider.review-reschedule',
  CREATE_ADDITIONAL_CHARGES: 'provider.create-additional-charges',
  GET_ADDITIONAL_CHARGES: 'provider.get-additional-charges',
  REVIEW_ADDITIONAL_CHARGES: 'provider.review-additional-charges',
  SUBMIT_REVIEW: 'provider.submit-review',
  SUBMIT_REPORT: 'provider.submit-report',
} as const;

export const CUSTOMER_PATTERNS = {
  GET_DASHBOARD: 'customer.get-dashboard',
  GET_PROFILE: 'customer.get-profile',
  UPDATE_PROFILE: 'customer.update-profile',
} as const;

export const ADMIN_PATTERNS = {
  // Existing
  UPDATE_DOCUMENT_STATUS: 'admin.update-document-status',

  // User Management
  GET_CUSTOMERS: 'admin.users.get-customers',
  GET_CUSTOMER_BY_ID: 'admin.users.get-customer-by-id',
  UPDATE_CUSTOMER_STATUS: 'admin.users.update-customer-status',
  GET_PROVIDERS: 'admin.users.get-providers',
  GET_PROVIDER_BY_ID: 'admin.users.get-provider-by-id',
  UPDATE_PROVIDER_STATUS: 'admin.users.update-provider-status',
  GET_PROVIDER_APPLICATIONS: 'admin.users.get-provider-applications',
  GET_PROVIDER_APPLICATION_BY_ID: 'admin.users.get-provider-application-by-id',
  UPDATE_PROVIDER_APPLICATION_STATUS: 'admin.users.update-provider-application-status',
  GET_REVIEWS: 'admin.users.get-reviews',
  DELETE_REVIEW: 'admin.users.delete-review',

  // Account
  GET_ADMIN_PROFILE: 'admin.account.get-profile',
  UPDATE_ADMIN_PROFILE: 'admin.account.update-profile',

  // Operations
  GET_ALL_BOOKINGS: 'admin.ops.get-all-bookings',
  GET_ONGOING: 'admin.ops.get-ongoing',
  UPDATE_BOOKING_STATUS: 'admin.ops.update-booking-status',
  CREATE_BOOKING_DISPUTE: 'admin.ops.create-booking-dispute',
  GET_DISPUTES: 'admin.ops.get-disputes',
  UPDATE_DISPUTE: 'admin.ops.update-dispute',
  GET_SUPPORT_TICKETS: 'admin.ops.get-support-tickets',
  UPDATE_SUPPORT_TICKET: 'admin.ops.update-support-ticket',

  // Finance
  GET_TRANSACTIONS: 'admin.finance.get-transactions',
  GET_EARNINGS: 'admin.finance.get-earnings',
  GET_PAYOUTS: 'admin.finance.get-payouts',
  UPDATE_PAYOUT: 'admin.finance.update-payout',
  GET_REFUNDS: 'admin.finance.get-refunds',
  MARK_REFUND: 'admin.finance.mark-refund',
  GET_FAILED_PAYMENTS: 'admin.finance.get-failed-payments',

  // Marketplace
  GET_CATEGORIES: 'admin.marketplace.get-categories',
  CREATE_CATEGORY: 'admin.marketplace.create-category',
  UPDATE_CATEGORY: 'admin.marketplace.update-category',
  DELETE_CATEGORY: 'admin.marketplace.delete-category',
  GET_ALL_SERVICES: 'admin.marketplace.get-all-services',
  UPDATE_SERVICE: 'admin.marketplace.update-service',
  DELETE_SERVICE: 'admin.marketplace.delete-service',
  GET_SERVICE_AREAS: 'admin.marketplace.get-service-areas',
  CREATE_SERVICE_AREA: 'admin.marketplace.create-service-area',
  UPDATE_SERVICE_AREA: 'admin.marketplace.update-service-area',
  DELETE_SERVICE_AREA: 'admin.marketplace.delete-service-area',
  SEND_BROADCAST: 'admin.marketplace.send-broadcast',

  // Reports
  GET_REVENUE_REPORT: 'admin.reports.revenue',
  GET_BOOKING_ANALYTICS: 'admin.reports.bookings',
  GET_BUSINESS_REPORT: 'admin.reports.business',
  GET_FINANCIAL_REPORT: 'admin.reports.financial',
  GET_USER_REPORT: 'admin.reports.users',
  GET_PERFORMANCE_REPORT: 'admin.reports.performance',
  GET_COMPLIANCE_REPORT: 'admin.reports.compliance',
} as const;

export const CATALOG_PATTERNS = {
  GET_ALL_SERVICES: 'catalog.get-all-services',
  SEARCH_SERVICES: 'catalog.search-services',
  GET_CATEGORIES: 'catalog.get-categories',
  GET_SERVICES_BY_CATEGORY: 'catalog.get-services-by-category',
  GET_PROVIDERS_BY_SERVICE: 'catalog.get-providers-by-service',
  GET_PROVIDER_SERVICES: 'catalog.get-provider-services',
  GET_PROVIDER_PROFILE_DATA: 'catalog.get-provider-profile-data',
  GET_REFERENCE_CATEGORIES: 'catalog.get-reference-categories',
  GET_LOCATIONS: 'catalog.get-locations',
  GET_PROVINCES: 'catalog.get-provinces',
  GET_CITIES: 'catalog.get-cities',
  GET_BARANGAYS: 'catalog.get-barangays',
} as const;

export const NOTIFICATION_PATTERNS = {
  GET_NOTIFICATIONS: 'notification.get-all',
  MARK_READ: 'notification.mark-read',
  MARK_ALL_READ: 'notification.mark-all-read',
  GET_UNREAD_COUNT: 'notification.get-unread-count',
} as const;

export const SUPPORT_PATTERNS = {
  CREATE_TICKET: 'support.create-ticket',
} as const;
