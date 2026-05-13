#!/usr/bin/env node
/**
 * Phase 5 verification - notifications DB contract.
 *
 * This checks the canonical notification_and_support.notifications shape used
 * by notifications-service. It intentionally stays at the schema boundary:
 * event emission is exercised by the later gateway/Kafka golden-path script.
 */
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const envPath = path.resolve(__dirname, '..', '.env');
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const URL = env.SUPABASE_URL;
const KEY = env.SUPABASE_SECRET_KEY;

async function req(method, schema, tableAndQuery, body) {
  const res = await fetch(`${URL}/rest/v1/${tableAndQuery}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Accept-Profile': schema,
      'Content-Profile': schema,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

function ok(label, cond, detail) {
  const mark = cond ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${label}${detail ? ' - ' + detail : ''}`);
  if (!cond) process.exitCode = 1;
  return cond;
}

(async () => {
  const stamp = Date.now();
  const customerId = randomUUID();
  const providerId = randomUUID();
  const categoryId = randomUUID();
  const bookingId = randomUUID();

  console.log('--- Phase 5 notifications DB verification ---');

  await req('POST', 'identity_and_user', 'users', [
    {
      id: customerId,
      email: `ph5_customer_${stamp}@test.local`,
      full_name: 'P5 Customer',
      contact_number: '09170000051',
      role: 'customer',
      status: 'active',
      is_verified: true,
    },
    {
      id: providerId,
      email: `ph5_provider_${stamp}@test.local`,
      full_name: 'P5 Provider',
      contact_number: '09170000052',
      role: 'provider',
      status: 'active',
      is_verified: true,
    },
  ]);
  await req('POST', 'identity_and_user', 'customer_profiles', [
    { user_id: customerId },
  ]);
  await req('POST', 'provider_catalog', 'provider_profiles', [
    {
      user_id: providerId,
      business_name: 'P5 Provider Co',
      verification_status: 'approved',
    },
  ]);
  await req('POST', 'provider_catalog', 'service_categories', [
    {
      id: categoryId,
      name: `P5 Category ${stamp}`,
      slug: `ph5-category-${stamp}`,
      display_order: 5,
    },
  ]);
  await req('POST', 'booking', 'bookings', [
    {
      id: bookingId,
      booking_reference: `PH5-${stamp}`,
      customer_id: customerId,
      provider_id: providerId,
      service_id: categoryId,
      service_title: 'P5 Service',
      service_name: 'P5 Service',
      service_description: 'Notification verification booking',
      service_address: 'Phase 5 Test Address',
      service_location_type: 'mobile',
      scheduled_at: new Date(Date.now() + 86400000).toISOString(),
      hours_required: 1,
      service_amount: 250,
      total_amount: 250,
      payment_method: 'cash_on_service',
      status: 'pending',
    },
  ]);

  const eventRows = [
    {
      user_id: providerId,
      actor_id: customerId,
      booking_id: bookingId,
      type: 'booking.created',
      title: 'New booking request',
      body: 'A customer created a booking.',
      data: { status: 'pending' },
    },
    {
      user_id: customerId,
      actor_id: providerId,
      booking_id: bookingId,
      type: 'booking.confirmed',
      title: 'Booking confirmed',
      body: 'Your provider confirmed the booking.',
      data: { status: 'confirmed' },
    },
    {
      user_id: customerId,
      actor_id: providerId,
      booking_id: bookingId,
      type: 'booking.in_progress',
      title: 'Service started',
      body: 'The provider started the service.',
      data: { status: 'in_progress' },
    },
    {
      user_id: customerId,
      actor_id: providerId,
      booking_id: bookingId,
      type: 'booking.completed',
      title: 'Service completed',
      body: 'The provider completed the service.',
      data: { status: 'completed' },
    },
    {
      user_id: providerId,
      actor_id: customerId,
      booking_id: bookingId,
      type: 'booking.cancelled',
      title: 'Booking cancelled',
      body: 'The booking was cancelled.',
      data: { status: 'cancelled' },
    },
    {
      user_id: providerId,
      actor_id: customerId,
      booking_id: bookingId,
      type: 'review.created',
      title: 'New review',
      body: 'A customer reviewed your service.',
      data: { rating: 5 },
    },
    {
      user_id: providerId,
      actor_id: customerId,
      booking_id: bookingId,
      type: 'dispute.created',
      title: 'Dispute opened',
      body: 'A dispute was opened for this booking.',
      data: { reason: 'test' },
    },
  ];

  const n1 = await req('POST', 'notification_and_support', 'notifications', eventRows);
  ok(
    'insert notification rows for booking/dispute/review events',
    n1.status === 201 && Array.isArray(n1.body) && n1.body.length === eventRows.length,
    `status=${n1.status} count=${Array.isArray(n1.body) ? n1.body.length : 'n/a'}`,
  );

  const defaultUnread = Array.isArray(n1.body)
    ? n1.body.every((row) => row.is_read === false)
    : false;
  ok('notifications default to is_read=false', defaultUnread);

  const providerUnread = await req(
    'GET',
    'notification_and_support',
    `notifications?user_id=eq.${providerId}&is_read=eq.false&select=id,type,is_read&order=created_at.desc`,
  );
  const providerUnreadRows = Array.isArray(providerUnread.body)
    ? providerUnread.body
    : [];
  ok(
    'fetch unread notifications by user using is_read',
    providerUnread.status === 200 && providerUnreadRows.length === 4,
    `status=${providerUnread.status} count=${providerUnreadRows.length}`,
  );

  const firstProviderNotificationId = providerUnreadRows[0]?.id;
  const markOne = await req(
    'PATCH',
    'notification_and_support',
    `notifications?id=eq.${firstProviderNotificationId}`,
    { is_read: true },
  );
  ok('mark one notification read via is_read', markOne.status === 200);

  const afterOneRead = await req(
    'GET',
    'notification_and_support',
    `notifications?user_id=eq.${providerId}&is_read=eq.false&select=id`,
  );
  ok(
    'unread count decreases after mark-read',
    afterOneRead.status === 200 &&
      Array.isArray(afterOneRead.body) &&
      afterOneRead.body.length === 3,
    `status=${afterOneRead.status} count=${Array.isArray(afterOneRead.body) ? afterOneRead.body.length : 'n/a'}`,
  );

  const markAll = await req(
    'PATCH',
    'notification_and_support',
    `notifications?user_id=eq.${providerId}&is_read=eq.false`,
    { is_read: true },
  );
  ok('mark all unread notifications read', markAll.status === 200);

  const afterAllRead = await req(
    'GET',
    'notification_and_support',
    `notifications?user_id=eq.${providerId}&is_read=eq.false&select=id`,
  );
  ok(
    'unread-count query returns zero after read-all',
    afterAllRead.status === 200 &&
      Array.isArray(afterAllRead.body) &&
      afterAllRead.body.length === 0,
    `status=${afterAllRead.status} count=${Array.isArray(afterAllRead.body) ? afterAllRead.body.length : 'n/a'}`,
  );

  const badInsert = await req('POST', 'notification_and_support', 'notifications', [
    {
      user_id: customerId,
      type: 'bad.read_at',
      title: 'Bad column',
      body: 'This should fail.',
      read_at: new Date().toISOString(),
    },
  ]);
  ok(
    'regression: bogus read_at column is rejected',
    badInsert.status >= 400,
    `status=${badInsert.status}`,
  );

  console.log('--- cleanup ---');
  await req(
    'DELETE',
    'notification_and_support',
    `notifications?booking_id=eq.${bookingId}`,
  );
  await req('DELETE', 'booking', `bookings?id=eq.${bookingId}`);
  await req(
    'DELETE',
    'provider_catalog',
    `service_categories?id=eq.${categoryId}`,
  );
  await req(
    'DELETE',
    'provider_catalog',
    `provider_profiles?user_id=eq.${providerId}`,
  );
  await req(
    'DELETE',
    'identity_and_user',
    `customer_profiles?user_id=eq.${customerId}`,
  );
  await req('DELETE', 'identity_and_user', `users?id=eq.${customerId}`);
  await req('DELETE', 'identity_and_user', `users?id=eq.${providerId}`);
  console.log('--- done ---');
})();
