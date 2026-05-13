-- ServEase microservices bootstrap schema
-- Generated for clean-database initialization.
-- Deprecated feature note: reschedule requests are intentionally removed,
-- so booking.booking_reschedule_requests is not created.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE SCHEMA IF NOT EXISTS identity_and_user;
CREATE SCHEMA IF NOT EXISTS provider_catalog;
CREATE SCHEMA IF NOT EXISTS booking;
CREATE SCHEMA IF NOT EXISTS payment;
CREATE SCHEMA IF NOT EXISTS notification_and_support;
CREATE SCHEMA IF NOT EXISTS trust_and_reputation;
CREATE SCHEMA IF NOT EXISTS messages;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- identity_and_user
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS identity_and_user.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  password_hash text,
  full_name text,
  contact_number text,
  avatar_url text,
  role text NOT NULL DEFAULT 'customer',
  status text NOT NULL DEFAULT 'active',
  verification_status text NOT NULL DEFAULT 'unverified',
  is_verified boolean NOT NULL DEFAULT false,
  google_id text,
  email_verified_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_role_check CHECK (role IN ('customer', 'provider', 'admin')),
  CONSTRAINT users_status_check CHECK (status IN ('active', 'inactive', 'suspended'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id
  ON identity_and_user.users (google_id)
  WHERE google_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS identity_and_user.customer_profiles (
  user_id uuid PRIMARY KEY
    REFERENCES identity_and_user.users(id) ON DELETE CASCADE,
  date_of_birth date,
  address text,
  barangay text,
  city text,
  province text,
  region text,
  zip_code text,
  postal_code text,
  landmark text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS identity_and_user.user_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL
    REFERENCES identity_and_user.users(id) ON DELETE CASCADE,
  label text,
  recipient_name text,
  contact_number text,
  address_line text NOT NULL,
  barangay text,
  city text,
  province text,
  region text,
  zip_code text,
  postal_code text,
  landmark text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id
  ON identity_and_user.user_addresses (user_id);
CREATE INDEX IF NOT EXISTS idx_user_addresses_default
  ON identity_and_user.user_addresses (user_id, is_default);

-- ---------------------------------------------------------------------------
-- provider_catalog
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS provider_catalog.provider_profiles (
  user_id uuid PRIMARY KEY,
  business_name text,
  service_description text,
  trust_score numeric(5, 2) NOT NULL DEFAULT 0,
  verification_status text NOT NULL DEFAULT 'pending',
  average_rating numeric(3, 2) NOT NULL DEFAULT 0,
  total_reviews integer NOT NULL DEFAULT 0,
  years_experience integer,
  service_radius_km numeric(6, 2),
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_profiles_verification_check
    CHECK (verification_status IN ('pending', 'approved', 'rejected', 'under_review'))
);

CREATE TABLE IF NOT EXISTS provider_catalog.service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  parent_id uuid REFERENCES provider_catalog.service_categories(id) ON DELETE SET NULL,
  icon_name text,
  display_order integer NOT NULL DEFAULT 0,
  category_level text NOT NULL DEFAULT 'category',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_categories_parent
  ON provider_catalog.service_categories (parent_id);
CREATE INDEX IF NOT EXISTS idx_service_categories_active
  ON provider_catalog.service_categories (is_active, display_order);

CREATE TABLE IF NOT EXISTS provider_catalog.provider_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL
    REFERENCES provider_catalog.provider_profiles(user_id) ON DELETE CASCADE,
  service_id uuid REFERENCES provider_catalog.service_categories(id) ON DELETE SET NULL,
  title text,
  description text,
  pricing_mode text NOT NULL DEFAULT 'hourly',
  price numeric(12, 2) NOT NULL DEFAULT 0,
  duration_minutes integer NOT NULL DEFAULT 60,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_services_pricing_mode_check
    CHECK (pricing_mode IN ('hourly', 'flat'))
);

CREATE INDEX IF NOT EXISTS idx_provider_services_provider
  ON provider_catalog.provider_services (provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_services_service
  ON provider_catalog.provider_services (service_id);

CREATE TABLE IF NOT EXISTS provider_catalog.provider_documents (
  document_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL
    REFERENCES provider_catalog.provider_profiles(user_id) ON DELETE CASCADE,
  document_type text NOT NULL,
  document_file_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  CONSTRAINT provider_documents_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'resubmitted'))
);

CREATE INDEX IF NOT EXISTS idx_provider_documents_provider
  ON provider_catalog.provider_documents (provider_id, uploaded_at DESC);

CREATE TABLE IF NOT EXISTS provider_catalog.location (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city text,
  province text,
  region text,
  barangay text,
  postal_code text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provider_catalog.psgc_provinces (
  code text PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_catalog.psgc_cities (
  code text PRIMARY KEY,
  province_code text NOT NULL REFERENCES provider_catalog.psgc_provinces(code) ON DELETE CASCADE,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_catalog.psgc_barangays (
  code text PRIMARY KEY,
  city_code text NOT NULL REFERENCES provider_catalog.psgc_cities(code) ON DELETE CASCADE,
  name text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_psgc_cities_province
  ON provider_catalog.psgc_cities (province_code, name);
CREATE INDEX IF NOT EXISTS idx_psgc_barangays_city
  ON provider_catalog.psgc_barangays (city_code, name);

-- ---------------------------------------------------------------------------
-- booking
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS booking.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_reference text NOT NULL UNIQUE,
  customer_id uuid NOT NULL,
  provider_id uuid NOT NULL,
  service_id uuid,
  service_title text,
  service_name text,
  service_description text,
  service_location_type text NOT NULL DEFAULT 'mobile',
  service_address text,
  scheduled_at timestamptz NOT NULL,
  hours_required integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  payment_method text NOT NULL DEFAULT 'cash_on_service',
  service_amount numeric(12, 2) NOT NULL DEFAULT 0,
  additional_amount numeric(12, 2) NOT NULL DEFAULT 0,
  total_amount numeric(12, 2) NOT NULL DEFAULT 0,
  customer_notes text,
  provider_notes text,
  cancelled_by uuid,
  cancel_reason text,
  cancel_explanation text,
  cancelled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookings_status_check
    CHECK (status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  CONSTRAINT bookings_hours_required_check
    CHECK (hours_required > 0)
);

CREATE INDEX IF NOT EXISTS idx_bookings_customer_status
  ON booking.bookings (customer_id, status, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_provider_status
  ON booking.bookings (provider_id, status, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_scheduled_at
  ON booking.bookings (scheduled_at);

CREATE TABLE IF NOT EXISTS booking.provider_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL,
  day_of_week integer NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_availability_day_check CHECK (day_of_week BETWEEN 0 AND 6),
  CONSTRAINT provider_availability_time_check CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_provider_availability_provider_day
  ON booking.provider_availability (provider_id, day_of_week);

CREATE TABLE IF NOT EXISTS booking.provider_days_off (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL,
  date date NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, date)
);

CREATE TABLE IF NOT EXISTS booking.booking_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES booking.bookings(id) ON DELETE CASCADE,
  uploaded_by uuid,
  file_path text,
  file_url text,
  file_name text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_attachments_booking
  ON booking.booking_attachments (booking_id, created_at DESC);

CREATE TABLE IF NOT EXISTS booking.additional_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES booking.bookings(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  description text NOT NULL,
  amount numeric(12, 2) NOT NULL,
  justification text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT additional_charges_status_check
    CHECK (status IN ('pending', 'approved', 'declined'))
);

CREATE INDEX IF NOT EXISTS idx_additional_charges_booking
  ON booking.additional_charges (booking_id, status);

CREATE TABLE IF NOT EXISTS booking.bookings_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES booking.bookings(id) ON DELETE CASCADE,
  user_id uuid,
  reason text,
  explanation text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- payment
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS payment.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL,
  customer_id uuid,
  provider_id uuid,
  amount numeric(12, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'PHP',
  method text NOT NULL DEFAULT 'cash_on_service',
  status text NOT NULL DEFAULT 'pending',
  transaction_reference text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_method_check CHECK (method IN ('cash_on_service', 'cash', 'card', 'wallet')),
  CONSTRAINT payment_status_check CHECK (status IN ('pending', 'completed', 'failed', 'cancelled', 'refunded'))
);

CREATE INDEX IF NOT EXISTS idx_payments_booking
  ON payment.payments (booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_status
  ON payment.payments (provider_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_customer_status
  ON payment.payments (customer_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS payment.provider_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL,
  period_start date,
  period_end date,
  gross_amount numeric(12, 2) NOT NULL DEFAULT 0,
  platform_fee numeric(12, 2) NOT NULL DEFAULT 0,
  net_amount numeric(12, 2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  reference text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_payout_status_check
    CHECK (status IN ('pending', 'processing', 'paid', 'failed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_provider_payouts_provider
  ON payment.provider_payouts (provider_id, status, created_at DESC);

-- ---------------------------------------------------------------------------
-- notification_and_support
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notification_and_support.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  actor_id uuid,
  booking_id uuid,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read
  ON notification_and_support.notifications (user_id, is_read, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_and_support.support_tickets (
  ticket_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  subject text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'normal',
  assigned_to uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_ticket_status_check
    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user
  ON notification_and_support.support_tickets (user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_and_support.disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL,
  customer_id uuid,
  provider_id uuid,
  reason text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open',
  resolution text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT disputes_status_check
    CHECK (status IN ('open', 'under_review', 'resolved', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_disputes_booking_status
  ON notification_and_support.disputes (booking_id, status, created_at DESC);

-- ---------------------------------------------------------------------------
-- trust_and_reputation
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS trust_and_reputation.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL,
  reviewer_id uuid NOT NULL,
  reviewee_id uuid NOT NULL,
  rating integer NOT NULL,
  review_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reviews_rating_check CHECK (rating BETWEEN 1 AND 5),
  UNIQUE (booking_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_reviewee
  ON trust_and_reputation.reviews (reviewee_id, created_at DESC);

CREATE TABLE IF NOT EXISTS trust_and_reputation.provider_profile_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid,
  reporter_id uuid NOT NULL,
  provider_id uuid NOT NULL,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_reports_status_check
    CHECK (status IN ('open', 'under_review', 'resolved', 'dismissed'))
);

CREATE INDEX IF NOT EXISTS idx_provider_reports_provider
  ON trust_and_reputation.provider_profile_reports (provider_id, status, created_at DESC);

-- ---------------------------------------------------------------------------
-- messages (chat)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS messages.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  context_type text NOT NULL,
  context_id text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (context_type, context_id)
);

CREATE TABLE IF NOT EXISTS messages.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES messages.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  message_type text NOT NULL DEFAULT 'text',
  body text NOT NULL,
  delivery_status text NOT NULL DEFAULT 'sent',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messages_delivery_status_check
    CHECK (delivery_status IN ('sent', 'delivered', 'read', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages.messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_sender
  ON messages.messages (sender_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_users_updated_at ON identity_and_user.users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON identity_and_user.users
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_customer_profiles_updated_at ON identity_and_user.customer_profiles;
CREATE TRIGGER trg_customer_profiles_updated_at
BEFORE UPDATE ON identity_and_user.customer_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_user_addresses_updated_at ON identity_and_user.user_addresses;
CREATE TRIGGER trg_user_addresses_updated_at
BEFORE UPDATE ON identity_and_user.user_addresses
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_provider_profiles_updated_at ON provider_catalog.provider_profiles;
CREATE TRIGGER trg_provider_profiles_updated_at
BEFORE UPDATE ON provider_catalog.provider_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_service_categories_updated_at ON provider_catalog.service_categories;
CREATE TRIGGER trg_service_categories_updated_at
BEFORE UPDATE ON provider_catalog.service_categories
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_provider_services_updated_at ON provider_catalog.provider_services;
CREATE TRIGGER trg_provider_services_updated_at
BEFORE UPDATE ON provider_catalog.provider_services
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_location_updated_at ON provider_catalog.location;
CREATE TRIGGER trg_location_updated_at
BEFORE UPDATE ON provider_catalog.location
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_bookings_updated_at ON booking.bookings;
CREATE TRIGGER trg_bookings_updated_at
BEFORE UPDATE ON booking.bookings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_provider_availability_updated_at ON booking.provider_availability;
CREATE TRIGGER trg_provider_availability_updated_at
BEFORE UPDATE ON booking.provider_availability
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_payments_updated_at ON payment.payments;
CREATE TRIGGER trg_payments_updated_at
BEFORE UPDATE ON payment.payments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_provider_payouts_updated_at ON payment.provider_payouts;
CREATE TRIGGER trg_provider_payouts_updated_at
BEFORE UPDATE ON payment.provider_payouts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_support_tickets_updated_at ON notification_and_support.support_tickets;
CREATE TRIGGER trg_support_tickets_updated_at
BEFORE UPDATE ON notification_and_support.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_disputes_updated_at ON notification_and_support.disputes;
CREATE TRIGGER trg_disputes_updated_at
BEFORE UPDATE ON notification_and_support.disputes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_reviews_updated_at ON trust_and_reputation.reviews;
CREATE TRIGGER trg_reviews_updated_at
BEFORE UPDATE ON trust_and_reputation.reviews
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_provider_reports_updated_at ON trust_and_reputation.provider_profile_reports;
CREATE TRIGGER trg_provider_reports_updated_at
BEFORE UPDATE ON trust_and_reputation.provider_profile_reports
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_conversations_updated_at ON messages.conversations;
CREATE TRIGGER trg_conversations_updated_at
BEFORE UPDATE ON messages.conversations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_messages_updated_at ON messages.messages;
CREATE TRIGGER trg_messages_updated_at
BEFORE UPDATE ON messages.messages
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;
