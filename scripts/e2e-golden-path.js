#!/usr/bin/env node
/**
 * Gateway/Kafka golden path smoke.
 *
 * Requires the gateway and all services to be running:
 *   docker compose up -d kafka
 *   npm run start:dev:all
 *
 * This script uses gateway HTTP for client-visible actions and the service
 * role only for deterministic fixture setup/approval, assertions, and cleanup.
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.resolve(__dirname, '..', '.env');
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
);

const API_BASE_URL = process.env.API_BASE_URL || env.API_BASE_URL || 'http://localhost:5000';
const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SECRET_KEY;
const supabaseAdmin =
  SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })
    : null;

const state = {
  stamp: Date.now(),
  customer: {
    id: null,
    token: null,
    email: '',
    password: 'Test@12345',
  },
  provider: {
    id: null,
    token: null,
    email: '',
    password: 'Test@12345',
  },
  documentPath: null,
  categoryId: null,
  serviceId: null,
  bookingId: null,
  paymentId: null,
  cancelBookingId: null,
  cancelPaymentId: null,
  additionalChargeIds: [],
  conversationId: null,
  reviewId: null,
  reportId: null,
  ticketId: null,
};

state.customer.email = `golden.customer.${state.stamp}@serve-ease.test`;
state.provider.email = `golden.provider.${state.stamp}@serve-ease.test`;

function nowIso(offsetMinutes = 180) {
  return new Date(Date.now() + offsetMinutes * 60 * 1000).toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function gateway(method, route, { token, body, formData } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!formData && body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${API_BASE_URL}${route}`, {
    method,
    headers,
    body: formData ? formData : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(`${method} ${route} failed (${response.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

async function expectGatewayFailure(
  method,
  route,
  { token, body, formData } = {},
  expectedStatuses = [],
) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!formData && body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${API_BASE_URL}${route}`, {
    method,
    headers,
    body: formData ? formData : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await readJson(response);
  if (response.ok) {
    throw new Error(`${method} ${route} unexpectedly succeeded: ${JSON.stringify(data)}`);
  }
  if (expectedStatuses.length > 0 && !expectedStatuses.includes(response.status)) {
    throw new Error(
      `${method} ${route} failed with unexpected status ${response.status}: ${JSON.stringify(data)}`,
    );
  }
  return data;
}

async function db(method, schema, tableAndQuery, body) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${tableAndQuery}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Accept-Profile': schema,
      'Content-Profile': schema,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(`${method} ${schema}.${tableAndQuery} failed (${response.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

async function waitFor(label, fn, attempts = 20, delayMs = 500) {
  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    if (i < attempts - 1) await sleep(delayMs);
  }
  if (lastError) throw lastError;
  throw new Error(`Timed out waiting for ${label}`);
}

async function deleteAuthUser(userId) {
  if (!userId || !supabaseAdmin) return;
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) {
    console.warn(`[cleanup warning] auth user ${userId}: ${error.message}`);
  }
}

async function registerCustomer() {
  const response = await gateway('POST', '/api/auth/v1/register/customer', {
    body: {
      full_name: 'Golden Customer',
      email: state.customer.email,
      password: state.customer.password,
      contact_number: '09179990001',
    },
  });
  state.customer.token = response?.session?.access_token || null;
  state.customer.id = response?.session?.user?.id || null;
  if (!state.customer.token || !state.customer.id) {
    throw new Error('Customer registration did not return a token and user id.');
  }
}

async function registerProvider() {
  const formData = new FormData();
  formData.append('full_name', 'Golden Provider');
  formData.append('email', state.provider.email);
  formData.append('password', state.provider.password);
  formData.append('contact_number', '09179990002');
  formData.append('business_name', 'Golden Provider Co');
  formData.append('document_type', 'government_id');
  formData.append('date_of_birth', '1990-01-01');
  formData.append(
    'document_file',
    new Blob(['golden verification document'], { type: 'text/plain' }),
    'golden-verification.txt',
  );

  const response = await gateway('POST', '/api/auth/v2/register', { formData });
  state.provider.id = response?.data?.provider_id || null;
  if (!state.provider.id) throw new Error('Provider registration did not return provider id.');
}

async function approveProviderWithServiceRole() {
  const docs = await db(
    'GET',
    'provider_catalog',
    `provider_documents?provider_id=eq.${state.provider.id}&select=document_id,document_file_path`,
  );
  const documentId = docs?.[0]?.document_id;
  if (!documentId) throw new Error('Provider document not found.');
  state.documentPath = docs?.[0]?.document_file_path || null;

  await db('PATCH', 'provider_catalog', `provider_documents?document_id=eq.${documentId}`, {
    status: 'approved',
    reviewed_at: new Date().toISOString(),
  });
  await db('PATCH', 'provider_catalog', `provider_profiles?user_id=eq.${state.provider.id}`, {
    verification_status: 'approved',
  });
}

async function loginProvider() {
  const response = await gateway('POST', '/api/auth/v1/login', {
    body: { email: state.provider.email, password: state.provider.password },
  });
  state.provider.token = response?.access_token || null;
  if (!state.provider.token) throw new Error('Provider login did not return access token.');
}

async function seedCategory() {
  const rows = await db('POST', 'provider_catalog', 'service_categories', [
    {
      name: `Golden Category ${state.stamp}`,
      slug: `golden-category-${state.stamp}`,
      display_order: 500,
      is_active: true,
    },
  ]);
  state.categoryId = rows?.[0]?.id || null;
  if (!state.categoryId) throw new Error('Category seed failed.');
}

async function saveProviderAvailability() {
  await gateway('PUT', '/api/provider/v1/availability', {
    token: state.provider.token,
    body: {
      weeklySchedule: [
        {
          day_of_week: 'Monday',
          is_active: true,
          start_time: '08:00:00',
          end_time: '17:00:00',
          break_start_time: '12:00:00',
          break_end_time: '13:00:00',
        },
        {
          day_of_week: 'Sunday',
          is_active: false,
          start_time: null,
          end_time: null,
          break_start_time: null,
          break_end_time: null,
        },
      ],
      daysOff: [],
    },
  });

  await waitFor('provider availability rows', async () => {
    const rows = await db(
      'GET',
      'booking',
      `provider_availability?user_id=eq.${state.provider.id}&select=id,day_of_week,is_active`,
    );
    return Array.isArray(rows) && rows.length >= 2 ? rows : null;
  });
}

async function createProviderService() {
  await gateway('POST', '/api/provider/v1/my-services', {
    token: state.provider.token,
    body: {
      service_id: state.categoryId,
      title: `Golden Service ${state.stamp}`,
      description: 'Golden path service',
      pricing_mode: 'flat',
      price: 125,
      duration_minutes: 60,
      is_active: true,
    },
  });

  const service = await waitFor('provider service', async () => {
    const rows = await db(
      'GET',
      'provider_catalog',
      `provider_services?provider_id=eq.${state.provider.id}&service_id=eq.${state.categoryId}&select=id`,
    );
    return rows?.[0] || null;
  });
  state.serviceId = service.id;
}

async function verifyDiscoveryAndAvailability() {
  const providers = await gateway(
    'GET',
    `/api/provider/v1?serviceId=${encodeURIComponent(state.categoryId)}`,
  );
  const rows = Array.isArray(providers?.data) ? providers.data : [];
  const foundProvider = rows.some((row) => row?.provider_id === state.provider.id);
  if (!foundProvider) {
    throw new Error('Approved provider did not appear in provider discovery.');
  }

  const availability = await gateway(
    'GET',
    `/api/provider/v1/${state.provider.id}/availability?weekOf=${encodeURIComponent(nowIso())}`,
  );
  if (!Array.isArray(availability?.weeklySchedule) || availability.weeklySchedule.length < 2) {
    throw new Error('Provider availability endpoint did not return seeded schedule.');
  }

  const check = await gateway(
    'GET',
    `/api/provider/v1/${state.provider.id}/availability/check?scheduled_at=${encodeURIComponent(
      nowIso(360),
    )}&hours_required=1`,
  );
  if (typeof check?.available !== 'boolean') {
    throw new Error('Provider availability check did not return an availability boolean.');
  }
}

async function createBooking() {
  const response = await gateway('POST', '/api/booking/v1/create', {
    token: state.customer.token,
    body: {
      provider_id: state.provider.id,
      service_id: state.serviceId,
      service_address: '123 Golden Path Street',
      service_location_type: 'mobile',
      scheduled_at: nowIso(),
      pricing_mode: 'flat',
      flat_rate: 125,
      hours_required: 1,
      payment_method: 'cash_on_service',
      customer_notes: 'Golden path booking',
    },
  });
  state.bookingId = response?.booking?.id || response?.id || null;
  if (!state.bookingId) throw new Error('Booking creation did not return booking id.');
}

async function setBookingStatus(bookingId, status) {
  await gateway('PATCH', `/api/provider/v1/booking/${bookingId}/status`, {
    token: state.provider.token,
    body: { status },
  });
  await waitFor(`booking status ${status}`, async () => {
    const rows = await db(
      'GET',
      'booking',
      `bookings?id=eq.${bookingId}&select=status,started_at,completed_at`,
    );
    const row = rows?.[0];
    if (row?.status !== status) return null;
    if (status === 'in_progress' && !row.started_at) return null;
    if (status === 'completed' && !row.completed_at) return null;
    return row;
  });
}

async function ensurePaymentPending(bookingId, amount) {
  const response = await gateway('POST', '/api/payments/v1/booking/ensure', {
    token: state.customer.token,
    body: {
      bookingId,
      provider_id: state.provider.id,
      amount,
      method: 'cash_on_service',
    },
  });
  const responsePaymentId = response?.payment?.id || response?.id || null;
  const row = await waitFor('pending payment row', async () => {
    const rows = await db(
      'GET',
      'payment',
      `payments?booking_id=eq.${bookingId}&select=id,status,amount`,
    );
    const payment = rows?.[0] || null;
    if (!payment) return null;
    if (payment.status !== 'pending') return null;
    if (Number(payment.amount) !== amount) return null;
    return payment;
  });
  return responsePaymentId || row.id;
}

async function completePayment() {
  await db('PATCH', 'payment', `payments?id=eq.${state.paymentId}`, {
    status: 'completed',
    paid_at: new Date().toISOString(),
  });
  await waitFor('completed payment row', async () => {
    const rows = await db(
      'GET',
      'payment',
      `payments?id=eq.${state.paymentId}&select=status,paid_at,amount`,
    );
    const payment = rows?.[0] || null;
    return payment?.status === 'completed' && payment?.paid_at ? payment : null;
  });
}

async function createAndApproveAdditionalCharges() {
  await gateway('POST', '/api/provider/v1/additional-charges', {
    token: state.provider.token,
    body: {
      bookingId: state.bookingId,
      justification: 'Golden path approved extra charge',
      items: [
        {
          description: 'Golden extra material',
          amount: 20,
        },
      ],
    },
  });

  const pendingCharges = await waitFor('pending additional charges', async () => {
    const rows = await db(
      'GET',
      'booking',
      `additional_charges?booking_id=eq.${state.bookingId}&select=id,status,amount`,
    );
    return Array.isArray(rows) && rows.length > 0 && rows.every((row) => row.status === 'pending')
      ? rows
      : null;
  });
  state.additionalChargeIds = pendingCharges.map((row) => row.id);

  await gateway('PATCH', '/api/provider/v1/additional-charges/review', {
    token: state.customer.token,
    body: {
      bookingId: state.bookingId,
      chargeIds: state.additionalChargeIds,
      decision: 'approved',
    },
  });

  await waitFor('approved additional charges and booking total', async () => {
    const [charges, bookings] = await Promise.all([
      db(
        'GET',
        'booking',
        `additional_charges?booking_id=eq.${state.bookingId}&select=status,reviewed_by`,
      ),
      db(
        'GET',
        'booking',
        `bookings?id=eq.${state.bookingId}&select=additional_amount,total_amount`,
      ),
    ]);
    const booking = bookings?.[0] || null;
    const chargesApproved =
      Array.isArray(charges) &&
      charges.length > 0 &&
      charges.every(
        (charge) =>
          charge.status === 'approved' && charge.reviewed_by === state.customer.id,
      );
    if (!chargesApproved) return null;
    if (Number(booking?.additional_amount) !== 20) return null;
    if (Number(booking?.total_amount) !== 145) return null;
    return { charges, booking };
  });

  await waitFor('payment amount updated after additional charges', async () => {
    const rows = await db('GET', 'payment', `payments?id=eq.${state.paymentId}&select=amount`);
    return Number(rows?.[0]?.amount) === 145 ? rows[0] : null;
  });
}

async function walkCompletedBookingPath() {
  await setBookingStatus(state.bookingId, 'confirmed');
  state.paymentId = await ensurePaymentPending(state.bookingId, 125);
  await setBookingStatus(state.bookingId, 'in_progress');
  await createAndApproveAdditionalCharges();
  await setBookingStatus(state.bookingId, 'completed');
  await completePayment();
}

async function createAndCancelSecondBooking() {
  const response = await gateway('POST', '/api/booking/v1/create', {
    token: state.customer.token,
    body: {
      provider_id: state.provider.id,
      service_id: state.serviceId,
      service_address: '456 Golden Cancel Street',
      service_location_type: 'mobile',
      scheduled_at: nowIso(720),
      pricing_mode: 'flat',
      flat_rate: 125,
      hours_required: 1,
      payment_method: 'cash_on_service',
      customer_notes: 'Golden path cancellation booking',
    },
  });
  state.cancelBookingId = response?.booking?.id || response?.id || null;
  if (!state.cancelBookingId) {
    throw new Error('Cancellation booking creation did not return booking id.');
  }
  state.cancelPaymentId = await ensurePaymentPending(state.cancelBookingId, 125);

  await gateway('PATCH', `/api/booking/v1/${state.cancelBookingId}/cancel`, {
    token: state.customer.token,
    body: {
      reason: 'schedule_conflict',
      explanation: 'Golden path cancellation check',
    },
  });

  await waitFor('cancelled booking and audit row', async () => {
    const [bookings, cancellations] = await Promise.all([
      db(
        'GET',
        'booking',
        `bookings?id=eq.${state.cancelBookingId}&select=status,cancelled_by,cancel_reason,cancel_explanation,cancelled_at`,
      ),
      db(
        'GET',
        'booking',
        `bookings_cancellations?booking_id=eq.${state.cancelBookingId}&select=id,user_id,reason,explanation`,
      ),
    ]);
    const booking = bookings?.[0] || null;
    const cancellation = cancellations?.[0] || null;
    if (booking?.status !== 'cancelled') return null;
    if (booking.cancelled_by !== state.customer.id) return null;
    if (!booking.cancelled_at) return null;
    if (!cancellation || cancellation.user_id !== state.customer.id) return null;
    return { booking, cancellation };
  });

  await waitFor('cancelled payment row', async () => {
    const rows = await db(
      'GET',
      'payment',
      `payments?id=eq.${state.cancelPaymentId}&select=status`,
    );
    return rows?.[0]?.status === 'cancelled' ? rows[0] : null;
  });
}

async function reviewAndReport() {
  await gateway('POST', '/api/provider/v1/reviews', {
    token: state.customer.token,
    body: {
      booking_id: state.bookingId,
      reviewee_id: state.provider.id,
      rating: 5,
      review_text: `Golden review ${state.stamp}`,
    },
  });
  await gateway('POST', '/api/provider/v1/reports', {
    token: state.customer.token,
    body: {
      booking_id: state.bookingId,
      provider_id: state.provider.id,
      reason: 'golden_path_check',
      details: 'Golden path provider report check',
    },
  });

  const review = await waitFor('review row', async () => {
    const rows = await db('GET', 'trust_and_reputation', `reviews?booking_id=eq.${state.bookingId}&select=id`);
    return rows?.[0] || null;
  });
  state.reviewId = review.id;

  await expectGatewayFailure(
    'POST',
    '/api/provider/v1/reviews',
    {
      token: state.customer.token,
      body: {
        booking_id: state.bookingId,
        reviewee_id: state.provider.id,
        rating: 5,
        review_text: `Golden duplicate review ${state.stamp}`,
      },
    },
    [409],
  );
  const reviews = await db(
    'GET',
    'trust_and_reputation',
    `reviews?booking_id=eq.${state.bookingId}&reviewer_id=eq.${state.customer.id}&select=id`,
  );
  if (!Array.isArray(reviews) || reviews.length !== 1) {
    throw new Error('Duplicate review guard did not keep one review per booking/reviewer.');
  }

  const report = await waitFor('provider report row', async () => {
    const rows = await db('GET', 'trust_and_reputation', `provider_profile_reports?booking_id=eq.${state.bookingId}&select=id`);
    return rows?.[0] || null;
  });
  state.reportId = report.id;
}

async function chatAndSupport() {
  await gateway('POST', `/api/chat/v1/conversations/${state.bookingId}/messages`, {
    token: state.customer.token,
    body: { text: 'Golden path hello from customer.' },
  });
  await gateway('POST', `/api/chat/v1/conversations/${state.bookingId}/messages`, {
    token: state.provider.token,
    body: { text: 'Golden path hello from provider.' },
  });
  await gateway('PATCH', `/api/chat/v1/conversations/${state.bookingId}/read`, {
    token: state.customer.token,
  });

  const conversation = await waitFor('booking conversation row', async () => {
    const rows = await db(
      'GET',
      'messages',
      `conversations?context_type=eq.booking&context_id=eq.${state.bookingId}&select=id`,
    );
    return rows?.[0] || null;
  });
  state.conversationId = conversation.id;

  await waitFor('chat read state', async () => {
    const rows = await db(
      'GET',
      'messages',
      `messages?conversation_id=eq.${state.conversationId}&select=sender_id,delivery_status`,
    );
    const messages = Array.isArray(rows) ? rows : [];
    const customerRows = messages.filter((row) => row.sender_id === state.customer.id);
    const providerRows = messages.filter((row) => row.sender_id === state.provider.id);
    if (!customerRows.length || !providerRows.length) return null;
    if (!customerRows.every((row) => row.delivery_status === 'sent')) return null;
    if (!providerRows.every((row) => row.delivery_status === 'read')) return null;
    return rows;
  });

  await gateway('POST', '/api/support/v1/tickets', {
    token: state.customer.token,
    body: {
      subject: `Golden support ${state.stamp}`,
      message: 'Golden path support ticket',
    },
  });
  const ticket = await waitFor('support ticket row', async () => {
    const encodedSubject = encodeURIComponent(`Golden support ${state.stamp}`);
    const rows = await db(
      'GET',
      'notification_and_support',
      `support_tickets?user_id=eq.${state.customer.id}&subject=eq.${encodedSubject}&select=ticket_id,status,priority`,
    );
    const row = rows?.[0] || null;
    return row?.status === 'open' && row?.priority === 'normal' ? row : null;
  });
  state.ticketId = ticket.ticket_id;
}

async function verifyNotifications() {
  await gateway('GET', '/api/notifications/v1', { token: state.customer.token });
  await gateway('GET', '/api/notifications/v1/unread-count', { token: state.customer.token });
  await waitFor('completed booking notifications', async () => {
    const rows = await db(
      'GET',
      'notification_and_support',
      `notifications?booking_id=eq.${state.bookingId}&select=id,type`,
    );
    if (!Array.isArray(rows)) return null;
    const types = new Set(rows.map((row) => row.type));
    return ['notification.booking-confirmed', 'notification.booking-in-progress', 'notification.booking-completed'].every((type) =>
      types.has(type),
    )
      ? rows
      : null;
  });
  await waitFor('cancel booking notifications', async () => {
    const rows = await db(
      'GET',
      'notification_and_support',
      `notifications?booking_id=eq.${state.cancelBookingId}&select=id,type`,
    );
    if (!Array.isArray(rows)) return null;
    return rows.some((row) => row.type === 'notification.booking-cancelled') ? rows : null;
  });
}

async function cleanupBookingArtifacts(bookingId) {
  if (!bookingId) return;
  await db('DELETE', 'notification_and_support', `notifications?booking_id=eq.${bookingId}`);
  const conversations = await db(
    'GET',
    'messages',
    `conversations?context_id=eq.${bookingId}&select=id`,
  );
  for (const conversation of conversations || []) {
    if (conversation?.id) {
      await db('DELETE', 'messages', `messages?conversation_id=eq.${conversation.id}`);
    }
  }
  await db('DELETE', 'messages', `conversations?context_id=eq.${bookingId}`);
  await db('DELETE', 'booking', `additional_charges?booking_id=eq.${bookingId}`);
  await db('DELETE', 'booking', `bookings_cancellations?booking_id=eq.${bookingId}`);
  await db('DELETE', 'payment', `payments?booking_id=eq.${bookingId}`);
  await db('DELETE', 'booking', `bookings?id=eq.${bookingId}`);
}

async function cleanup() {
  if (state.customer.id) await db('DELETE', 'notification_and_support', `notifications?user_id=eq.${state.customer.id}`);
  if (state.provider.id) await db('DELETE', 'notification_and_support', `notifications?user_id=eq.${state.provider.id}`);
  if (state.ticketId) await db('DELETE', 'notification_and_support', `support_tickets?ticket_id=eq.${state.ticketId}`);
  if (state.reportId) await db('DELETE', 'trust_and_reputation', `provider_profile_reports?id=eq.${state.reportId}`);
  if (state.reviewId) await db('DELETE', 'trust_and_reputation', `reviews?id=eq.${state.reviewId}`);
  await cleanupBookingArtifacts(state.bookingId);
  await cleanupBookingArtifacts(state.cancelBookingId);
  if (state.provider.id) await db('DELETE', 'booking', `provider_availability?user_id=eq.${state.provider.id}`);
  if (state.provider.id) await db('DELETE', 'booking', `provider_days_off?user_id=eq.${state.provider.id}`);
  if (state.serviceId) await db('DELETE', 'provider_catalog', `provider_services?id=eq.${state.serviceId}`);
  if (state.categoryId) await db('DELETE', 'provider_catalog', `service_categories?id=eq.${state.categoryId}`);
  if (state.provider.id) await db('DELETE', 'provider_catalog', `provider_documents?provider_id=eq.${state.provider.id}`);
  if (state.documentPath && supabaseAdmin) {
    await supabaseAdmin.storage.from('verification-docs').remove([state.documentPath]);
  }
  if (state.provider.id) await db('DELETE', 'provider_catalog', `provider_profiles?user_id=eq.${state.provider.id}`);
  if (state.customer.id) await db('DELETE', 'identity_and_user', `customer_profiles?user_id=eq.${state.customer.id}`);
  if (state.customer.id) await db('DELETE', 'identity_and_user', `users?id=eq.${state.customer.id}`);
  if (state.provider.id) await db('DELETE', 'identity_and_user', `users?id=eq.${state.provider.id}`);
  await deleteAuthUser(state.customer.id);
  await deleteAuthUser(state.provider.id);
}

async function main() {
  const steps = [
    ['register customer', registerCustomer],
    ['register provider', registerProvider],
    ['approve provider fixture', approveProviderWithServiceRole],
    ['login provider', loginProvider],
    ['save provider availability', saveProviderAvailability],
    ['seed category', seedCategory],
    ['create provider service', createProviderService],
    ['discovery and availability', verifyDiscoveryAndAvailability],
    ['create booking', createBooking],
    ['completed booking path', walkCompletedBookingPath],
    ['cancel booking path', createAndCancelSecondBooking],
    ['review and report', reviewAndReport],
    ['chat and support', chatAndSupport],
    ['notifications', verifyNotifications],
  ];

  const results = [];
  try {
    await waitFor(
      'gateway catalog readiness',
      () => gateway('GET', '/api/services/v1/categories').catch(() => null),
      40,
      1000,
    );
    for (const [label, fn] of steps) {
      const startedAt = Date.now();
      await fn();
      results.push({ label, ms: Date.now() - startedAt });
      console.log(`[PASS] ${label}`);
    }
    console.log(JSON.stringify({ ok: true, results }, null, 2));
  } finally {
    await cleanup().catch((error) => {
      console.warn(`[cleanup warning] ${error.message}`);
    });
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
