#!/usr/bin/env node
/**
 * Phase 2 verification — booking lifecycle end-to-end against live DB.
 *
 * Simulates the booking-service DB writes without the NestJS/Kafka layer:
 *   1. Seed approved provider + customer
 *   2. Create booking (using the NEW payload shape — no hourly_rate/flat_rate)
 *   3. Provider confirms → in_progress → completed
 *   4. Create a second booking, then customer cancels it (verifies booking
 *      update + bookings_cancellations insert both hit valid columns)
 *   5. Cleanup
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
  console.log(`[${mark}] ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) process.exitCode = 1;
  return cond;
}

(async () => {
  const providerId = randomUUID();
  const customerId = randomUUID();
  const serviceCategoryId = randomUUID();

  console.log('--- Phase 2 booking-lifecycle DB verification ---');

  // Seed users
  await req('POST', 'identity_and_user', 'users', [
    {
      id: customerId,
      email: `ph2_cust_${Date.now()}@test.local`,
      full_name: 'P2 Cust',
      contact_number: '09170000011',
      role: 'customer',
      status: 'active',
      is_verified: true,
    },
  ]);
  await req('POST', 'identity_and_user', 'users', [
    {
      id: providerId,
      email: `ph2_prov_${Date.now()}@test.local`,
      full_name: 'P2 Prov',
      contact_number: '09170000012',
      role: 'provider',
      status: 'active',
      is_verified: false,
    },
  ]);
  await req('POST', 'identity_and_user', 'customer_profiles', [
    { user_id: customerId },
  ]);
  await req('POST', 'provider_catalog', 'provider_profiles', [
    {
      user_id: providerId,
      business_name: 'P2 Biz',
      verification_status: 'approved',
    },
  ]);

  // Seed a service category + provider_service so booking has a real service_id
  const cat = await req('POST', 'provider_catalog', 'service_categories', [
    { name: `P2 Cat ${Date.now()}`, slug: `p2-cat-${Date.now()}` },
  ]);
  const categoryId = cat.body?.[0]?.id;
  const svc = await req('POST', 'provider_catalog', 'provider_services', [
    {
      provider_id: providerId,
      service_id: categoryId,
      title: 'P2 Svc',
      price: 500,
      pricing_mode: 'flat',
      duration_minutes: 60,
    },
  ]);
  const serviceId = svc.body?.[0]?.id;
  ok('seed provider_service', !!serviceId, `serviceId=${serviceId}`);

  // 1. Create booking (NEW payload shape — no hourly_rate / flat_rate)
  const bookingRef = `BKG-${Math.floor(100000 + Math.random() * 900000)}`;
  const c1 = await req('POST', 'booking', 'bookings', [
    {
      booking_reference: bookingRef,
      customer_id: customerId,
      provider_id: providerId,
      service_id: serviceId,
      service_description: 'Deep cleaning',
      service_address: '123 Test St',
      service_location_type: 'mobile',
      scheduled_at: new Date(Date.now() + 86400000).toISOString(),
      hours_required: 2,
      service_amount: 1000,
      total_amount: 1000,
      payment_method: 'cash_on_service',
      status: 'pending',
    },
  ]);
  const bookingRow = Array.isArray(c1.body) ? c1.body[0] : null;
  ok(
    'create booking (pending, no hourly_rate/flat_rate)',
    c1.status === 201 && !!bookingRow?.id,
    `status=${c1.status}`,
  );
  const bookingId = bookingRow?.id;

  // 2. Provider confirms
  const c2 = await req('PATCH', 'booking', `bookings?id=eq.${bookingId}`, {
    status: 'confirmed',
  });
  ok(
    'provider confirms (status=confirmed)',
    c2.status === 200,
    `status=${c2.status}`,
  );

  // 3. Provider starts
  const c3 = await req('PATCH', 'booking', `bookings?id=eq.${bookingId}`, {
    status: 'in_progress',
    started_at: new Date().toISOString(),
  });
  ok(
    'provider starts (status=in_progress, started_at set)',
    c3.status === 200,
    `status=${c3.status}`,
  );

  // 4. Provider completes
  const c4 = await req('PATCH', 'booking', `bookings?id=eq.${bookingId}`, {
    status: 'completed',
    completed_at: new Date().toISOString(),
  });
  ok(
    'provider completes (status=completed, completed_at set)',
    c4.status === 200,
    `status=${c4.status}`,
  );

  // Regression: old buggy status 'disputed' must still be rejected
  const c4bad = await req('PATCH', 'booking', `bookings?id=eq.${bookingId}`, {
    status: 'disputed',
  });
  ok(
    `regression: status='disputed' rejected by CHECK`,
    c4bad.status >= 400,
    `status=${c4bad.status}`,
  );

  // 5. Create a second booking & cancel it via customer
  const bookingRef2 = `BKG-${Math.floor(100000 + Math.random() * 900000)}`;
  const c5 = await req('POST', 'booking', 'bookings', [
    {
      booking_reference: bookingRef2,
      customer_id: customerId,
      provider_id: providerId,
      service_id: serviceId,
      service_description: 'Cancel test',
      service_address: '123 Test St',
      service_location_type: 'mobile',
      scheduled_at: new Date(Date.now() + 86400000).toISOString(),
      hours_required: 1,
      service_amount: 500,
      total_amount: 500,
      payment_method: 'cash_on_service',
      status: 'pending',
    },
  ]);
  const bookingId2 = c5.body?.[0]?.id;
  ok('create second booking (for cancel)', c5.status === 201 && !!bookingId2);

  // Cancel — update booking columns the schema actually has
  const c6 = await req('PATCH', 'booking', `bookings?id=eq.${bookingId2}`, {
    status: 'cancelled',
    cancelled_by: customerId,
    cancel_reason: 'schedule conflict',
    cancel_explanation: 'need to reschedule',
    cancelled_at: new Date().toISOString(),
  });
  ok(
    'cancel writes cancelled_by/cancel_reason/cancel_explanation/cancelled_at',
    c6.status === 200,
    `status=${c6.status}`,
  );

  // 6. Insert into bookings_cancellations using CORRECT column names
  const c7 = await req('POST', 'booking', 'bookings_cancellations', [
    {
      booking_id: bookingId2,
      user_id: customerId,
      reason: 'schedule conflict',
      explanation: 'need to reschedule',
    },
  ]);
  ok(
    'bookings_cancellations insert with user_id/explanation',
    c7.status === 201,
    `status=${c7.status}`,
  );

  // Regression: old buggy 'cancelled_by' column on cancellations must fail
  const c7bad = await req('POST', 'booking', 'bookings_cancellations', [
    {
      booking_id: bookingId2,
      cancelled_by: customerId, // wrong column name
      reason: 'x',
      detailed_explanation: 'y', // wrong column name
    },
  ]);
  ok(
    'regression: old buggy columns (cancelled_by/detailed_explanation) on bookings_cancellations rejected',
    c7bad.status >= 400,
    `status=${c7bad.status}`,
  );

  // Cleanup
  console.log('--- cleanup ---');
  await req(
    'DELETE',
    'booking',
    `bookings_cancellations?booking_id=eq.${bookingId2}`,
  );
  if (bookingId) await req('DELETE', 'booking', `bookings?id=eq.${bookingId}`);
  if (bookingId2)
    await req('DELETE', 'booking', `bookings?id=eq.${bookingId2}`);
  if (serviceId)
    await req(
      'DELETE',
      'provider_catalog',
      `provider_services?id=eq.${serviceId}`,
    );
  if (categoryId)
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
