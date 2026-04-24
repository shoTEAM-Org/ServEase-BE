#!/usr/bin/env node

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error('SUPABASE_URL is required');
}

if (!SUPABASE_SERVICE_KEY) {
  throw new Error('SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required');
}

const state = {
  runId: Date.now(),
  customer: {
    email: '',
    password: 'Test@12345',
    full_name: 'Phase 10 Customer',
    contact_number: '+15550001010',
    token: null,
    id: null,
  },
  provider: {
    email: '',
    password: 'Test@12345',
    full_name: 'Phase 10 Provider',
    business_name: 'Phase 10 Services',
    contact_number: '+15550001011',
    token: null,
    id: null,
  },
  categoryId: null,
  serviceId: null,
  bookingId: null,
  paymentId: null,
  reviewId: null,
  supportTicketId: null,
  serviceTitle: '',
  reviewText: '',
  supportSubject: '',
};

state.customer.email = `phase10.customer.${state.runId}@example.com`;
state.provider.email = `phase10.provider.${state.runId}@example.com`;
state.serviceTitle = `Phase 10 Deep Clean ${state.runId}`;
state.reviewText = `Phase 10 verification review ${state.runId}`;
state.supportSubject = `Phase 10 verification support ticket ${state.runId}`;

function nowIso(offsetMinutes = 120) {
  return new Date(Date.now() + offsetMinutes * 60 * 1000).toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(label, resolver, { attempts = 15, delayMs = 400 } = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const value = await resolver();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }

    if (attempt < attempts) {
      await sleep(delayMs);
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error(`Timed out waiting for ${label}`);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function gatewayRequest(method, path, { token, body, formData } = {}) {
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (!formData && body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: formData ? formData : body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(`${method} ${path} failed (${response.status}): ${JSON.stringify(data)}`);
  }

  return data;
}

async function supabaseRequest(method, path, body) {
  const dotIndex = path.indexOf('.');
  const schema = dotIndex > 0 ? path.slice(0, dotIndex) : '';
  const tableAndQuery = dotIndex > 0 ? path.slice(dotIndex + 1) : path;

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${tableAndQuery}`, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      ...(schema
        ? {
            'Accept-Profile': schema,
            'Content-Profile': schema,
          }
        : {}),
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(`${method} ${path} failed (${response.status}): ${JSON.stringify(data)}`);
  }

  return data;
}

async function createCustomer() {
  const response = await gatewayRequest('POST', '/api/auth/v1/register/customer', {
    body: {
      full_name: state.customer.full_name,
      email: state.customer.email,
      password: state.customer.password,
      contact_number: state.customer.contact_number,
    },
  });

  state.customer.token = response?.session?.access_token || response?.access_token || null;
  state.customer.id = response?.user?.id || response?.session?.user?.id || null;

  if (!state.customer.token || !state.customer.id) {
    throw new Error('Customer registration did not return session data');
  }
}

async function registerProvider() {
  const formData = new FormData();
  formData.append('full_name', state.provider.full_name);
  formData.append('email', state.provider.email);
  formData.append('password', state.provider.password);
  formData.append('contact_number', state.provider.contact_number);
  formData.append('business_name', state.provider.business_name);
  formData.append('document_type', 'government_id');
  formData.append('date_of_birth', '1990-01-01');
  formData.append(
    'document_file',
    new Blob(['phase10 verification document'], { type: 'application/pdf' }),
    'phase10-provider-document.pdf',
  );

  const response = await gatewayRequest('POST', '/api/auth/v2/register', {
    formData,
  });

  state.provider.id = response?.data?.provider_id || response?.provider_id || response?.data?.user_id || null;
  if (!state.provider.id) {
    throw new Error('Provider registration did not return provider id');
  }
}

async function approveProviderProfile() {
  await supabaseRequest(
    'PATCH',
    `provider_catalog.provider_profiles?user_id=eq.${state.provider.id}`,
    { verification_status: 'approved' },
  );
}

async function loginProvider() {
  const response = await gatewayRequest('POST', '/api/auth/v1/login', {
    body: {
      email: state.provider.email,
      password: state.provider.password,
    },
  });

  state.provider.token = response?.access_token || response?.session?.access_token || null;
  if (!state.provider.token) {
    throw new Error('Provider login did not return access token');
  }
}

async function seedServiceCategory() {
  const slug = `phase10-category-${Date.now()}`;
  const rows = await supabaseRequest('POST', 'provider_catalog.service_categories', {
    name: 'Phase 10 Verification',
    slug,
    is_active: true,
  });
  const first = Array.isArray(rows) ? rows[0] : rows;
  state.categoryId = first?.id || first?.category_id || null;
  if (!state.categoryId) {
    throw new Error('Failed to seed provider service category');
  }
}

async function createProviderService() {
  await gatewayRequest('POST', '/api/provider/v1/my-services', {
    token: state.provider.token,
    body: {
      title: state.serviceTitle,
      description: 'Verification service created by phase 10 script',
      category_id: state.categoryId,
      price: 125,
      service_location_type: 'mobile',
    },
  });

  const createdService = await waitFor('provider service', async () => {
    const response = await gatewayRequest('GET', '/api/provider/v1/my-services', {
      token: state.provider.token,
    });

    const services = Array.isArray(response?.services) ? response.services : [];
    return services.find((service) => service?.title === state.serviceTitle) || null;
  });

  state.serviceId = createdService?.id || null;
  if (!state.serviceId) {
    throw new Error('Provider service lookup did not return service id');
  }
}

async function createBooking() {
  const response = await gatewayRequest('POST', '/api/booking/v1/create', {
    token: state.customer.token,
    body: {
      provider_id: state.provider.id,
      service_id: state.serviceId,
      service_address: '123 Verification Ave, Suite 10',
      service_location_type: 'mobile',
      scheduled_at: nowIso(180),
      pricing_mode: 'flat',
      flat_rate: 125,
      hours_required: 1,
      payment_method: 'cash_on_service',
      customer_notes: 'Phase 10 verification booking',
    },
  });

  state.bookingId = response?.booking?.id || response?.booking?.booking_id || response?.id || null;
  if (!state.bookingId) {
    throw new Error('Booking creation did not return booking id');
  }
}

async function ensurePayment() {
  const response = await gatewayRequest('POST', '/api/payments/v1/booking/ensure', {
    token: state.customer.token,
    body: {
      bookingId: state.bookingId,
      provider_id: state.provider.id,
      amount: 125,
      method: 'cash_on_service',
    },
  });

  state.paymentId = response?.payment?.id || response?.id || null;
}

async function sendChatMessages() {
  await gatewayRequest('POST', `/api/chat/v1/conversations/${state.bookingId}/messages`, {
    token: state.customer.token,
    body: { text: 'Customer checking in for phase 10 verification.' },
  });

  await gatewayRequest('POST', `/api/chat/v1/conversations/${state.bookingId}/messages`, {
    token: state.provider.token,
    body: { text: 'Provider confirmed and ready for phase 10 verification.' },
  });
}

async function updateBookingLifecycle() {
  await gatewayRequest('PATCH', `/api/provider/v1/booking/${state.bookingId}/status`, {
    token: state.provider.token,
    body: { status: 'confirmed' },
  });
  await gatewayRequest('PATCH', `/api/provider/v1/booking/${state.bookingId}/status`, {
    token: state.provider.token,
    body: { status: 'in_progress' },
  });
  await gatewayRequest('PATCH', `/api/provider/v1/booking/${state.bookingId}/status`, {
    token: state.provider.token,
    body: { status: 'completed' },
  });
}

async function createSupportTicket() {
  await gatewayRequest('POST', '/api/support/v1/tickets', {
    token: state.customer.token,
    body: {
      subject: state.supportSubject,
      message: `Created during phase 10 verification run ${state.runId}`,
      category: 'booking',
      booking_id: state.bookingId,
    },
  });

  const supportTicket = await waitFor('support ticket', async () => {
    const response = await supabaseRequest(
      'GET',
      `notification_and_support.support_tickets?user_id=eq.${state.customer.id}&subject=eq.${encodeURIComponent(state.supportSubject)}&order=created_at.desc&limit=1`,
    );
    const tickets = Array.isArray(response) ? response : [];
    return tickets[0] || null;
  });

  state.supportTicketId = supportTicket?.ticket_id || supportTicket?.id || null;
}

async function createReview() {
  await gatewayRequest('POST', '/api/provider/v1/reviews', {
    token: state.provider.token,
    body: {
      booking_id: state.bookingId,
      reviewee_id: state.customer.id,
      rating: 5,
      review_text: state.reviewText,
    },
  });

  const review = await waitFor('provider review', async () => {
    const response = await supabaseRequest(
      'GET',
      `trust_and_reputation.reviews?booking_id=eq.${state.bookingId}&reviewer_id=eq.${state.provider.id}&order=created_at.desc&limit=1`,
    );
    const reviews = Array.isArray(response) ? response : [];
    return reviews.find((row) => row?.review_text === state.reviewText) || reviews[0] || null;
  });

  state.reviewId = review?.id || null;
}

async function cleanup() {
  if (state.reviewId) {
    await supabaseRequest('DELETE', `trust_and_reputation.reviews?id=eq.${state.reviewId}`);
  }
  if (state.supportTicketId) {
    await supabaseRequest('DELETE', `notification_and_support.support_tickets?ticket_id=eq.${state.supportTicketId}`);
  }
  if (state.bookingId) {
    await supabaseRequest('DELETE', `notification_and_support.notifications?booking_id=eq.${state.bookingId}`);
  }
  if (state.customer.id) {
    await supabaseRequest('DELETE', `notification_and_support.notifications?user_id=eq.${state.customer.id}`);
  }
  if (state.provider.id) {
    await supabaseRequest('DELETE', `notification_and_support.notifications?user_id=eq.${state.provider.id}`);
  }
  if (state.bookingId) {
    await supabaseRequest('DELETE', `messages.conversations?context_id=eq.${state.bookingId}`);
  }
  if (state.paymentId) {
    await supabaseRequest('DELETE', `payment.payments?id=eq.${state.paymentId}`);
  }
  if (state.bookingId) {
    await supabaseRequest('DELETE', `booking.bookings?id=eq.${state.bookingId}`);
  }
  if (state.serviceId) {
    await supabaseRequest('DELETE', `provider_catalog.provider_services?id=eq.${state.serviceId}`);
  }
  if (state.categoryId) {
    await supabaseRequest('DELETE', `provider_catalog.service_categories?id=eq.${state.categoryId}`);
  }
  if (state.provider.id) {
    await supabaseRequest('DELETE', `provider_catalog.provider_documents?provider_id=eq.${state.provider.id}`);
  }
  if (state.provider.id) {
    await supabaseRequest('DELETE', `provider_catalog.provider_profiles?user_id=eq.${state.provider.id}`);
  }
  if (state.customer.id) {
    await supabaseRequest('DELETE', `identity_and_user.users?id=eq.${state.customer.id}`);
  }
  if (state.provider.id) {
    await supabaseRequest('DELETE', `identity_and_user.users?id=eq.${state.provider.id}`);
  }
}

async function main() {
  const steps = [
    ['Customer registration', createCustomer],
    ['Provider registration', registerProvider],
    ['Provider approval seed', approveProviderProfile],
    ['Provider login', loginProvider],
    ['Seed service category', seedServiceCategory],
    ['Create provider service', createProviderService],
    ['Create booking', createBooking],
    ['Ensure payment', ensurePayment],
    ['Update booking lifecycle', updateBookingLifecycle],
    ['Send chat messages', sendChatMessages],
    ['Create support ticket', createSupportTicket],
    ['Create review', createReview],
  ];

  const results = [];
  try {
    for (const [label, step] of steps) {
      const startedAt = Date.now();
      await step();
      results.push({ label, ms: Date.now() - startedAt, ok: true });
    }

    await gatewayRequest('GET', '/api/booking/v1/history', { token: state.customer.token });
    await gatewayRequest('GET', '/api/booking/v1/requests', { token: state.provider.token });
    await gatewayRequest('GET', `/api/booking/v1/${state.bookingId}`, { token: state.customer.token });
    await gatewayRequest('GET', `/api/provider/v1/booking/${state.bookingId}`, { token: state.provider.token });
    await gatewayRequest('GET', `/api/payments/v1/booking/${state.bookingId}`, { token: state.customer.token });
    await gatewayRequest('GET', '/api/payments/v1/provider/history', { token: state.provider.token });
    await gatewayRequest('GET', '/api/payments/v1/provider/earnings-summary', { token: state.provider.token });
    await gatewayRequest('GET', '/api/chat/v1/conversations?role=customer', { token: state.customer.token });
    await gatewayRequest('GET', `/api/chat/v1/conversations/${state.bookingId}/messages`, { token: state.customer.token });
    await gatewayRequest('GET', '/api/notifications/v1', { token: state.customer.token });
    await gatewayRequest('GET', '/api/notifications/v1/unread-count', { token: state.customer.token });
    await gatewayRequest('PATCH', '/api/notifications/v1/read-all', { token: state.customer.token });
    await gatewayRequest('GET', `/api/provider/v1/reviews/${state.provider.id}`, { token: state.provider.token });
    await gatewayRequest('GET', '/api/users/v1/profile', { token: state.customer.token });

    console.log(JSON.stringify({ ok: true, results }, null, 2));
  } finally {
    await cleanup().catch((error) => {
      console.warn(JSON.stringify({ cleanupWarning: error.message }));
    });
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
