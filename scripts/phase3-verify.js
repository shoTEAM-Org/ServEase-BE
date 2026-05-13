#!/usr/bin/env node
/**
 * Phase 3 verification — payment lifecycle against live DB.
 *
 * 1. Seed customer, provider, booking.
 * 2. ensureBookingPayment: insert payment row (pending).
 * 3. markBookingPaymentPaid: update status=completed, paid_at=now.
 * 4. cancelBookingPayment: update status=cancelled.
 * 5. Cleanup.
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
  const customerId = randomUUID();
  const providerId = randomUUID();
  console.log('--- Phase 3 payment lifecycle DB verification ---');

  await req('POST', 'identity_and_user', 'users', [
    {
      id: customerId,
      email: `ph3_cust_${Date.now()}@test.local`,
      full_name: 'P3 Cust',
      contact_number: '09170000021',
      role: 'customer',
      status: 'active',
      is_verified: true,
    },
  ]);
  await req('POST', 'identity_and_user', 'users', [
    {
      id: providerId,
      email: `ph3_prov_${Date.now()}@test.local`,
      full_name: 'P3 Prov',
      contact_number: '09170000022',
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
      business_name: 'P3 Biz',
      verification_status: 'approved',
    },
  ]);

  // Create booking
  const bookingRef = `BKG-${Math.floor(100000 + Math.random() * 900000)}`;
  const bk = await req('POST', 'booking', 'bookings', [
    {
      booking_reference: bookingRef,
      customer_id: customerId,
      provider_id: providerId,
      service_address: '123 Test',
      service_location_type: 'mobile',
      scheduled_at: new Date(Date.now() + 86400000).toISOString(),
      hours_required: 1,
      service_amount: 750,
      total_amount: 750,
      payment_method: 'cash_on_service',
      status: 'completed',
    },
  ]);
  const bookingId = bk.body?.[0]?.id;
  ok('seed completed booking', !!bookingId);

  // Ensure payment (insert pending)
  const pay = await req('POST', 'payment', 'payments', [
    {
      booking_id: bookingId,
      customer_id: customerId,
      provider_id: providerId,
      amount: 750,
      method: 'cash_on_service',
      status: 'pending',
    },
  ]);
  const paymentId = pay.body?.[0]?.id;
  ok(
    'ensureBookingPayment inserts pending row',
    pay.status === 201 && !!paymentId,
    `status=${pay.status}`,
  );

  // Mark paid
  const markPaid = await req(
    'PATCH',
    'payment',
    `payments?id=eq.${paymentId}`,
    {
      status: 'completed',
      paid_at: new Date().toISOString(),
    },
  );
  ok(
    'markBookingPaymentPaid updates to completed',
    markPaid.status === 200,
    `status=${markPaid.status}`,
  );

  // Regression: invalid status rejected
  const badStatus = await req(
    'PATCH',
    'payment',
    `payments?id=eq.${paymentId}`,
    { status: 'bogus' },
  );
  ok('regression: invalid payment status rejected', badStatus.status >= 400);

  // Regression: invalid method rejected
  const bad = await req('POST', 'payment', 'payments', [
    {
      booking_id: bookingId,
      customer_id: customerId,
      provider_id: providerId,
      amount: 100,
      method: 'bitcoin',
      status: 'pending',
    },
  ]);
  ok("regression: payment method 'bitcoin' rejected", bad.status >= 400);

  // Cancel flow
  const cancel = await req('PATCH', 'payment', `payments?id=eq.${paymentId}`, {
    status: 'cancelled',
  });
  ok('cancelBookingPayment updates to cancelled', cancel.status === 200);

  // Read earnings sum (mimic getEarnings)
  const earnings = await req(
    'GET',
    'payment',
    `payments?provider_id=eq.${providerId}&status=eq.completed&select=amount`,
  );
  ok(
    'read earnings by status=completed',
    earnings.status === 200 && Array.isArray(earnings.body),
  );

  console.log('--- cleanup ---');
  await req('DELETE', 'payment', `payments?booking_id=eq.${bookingId}`);
  if (bookingId) await req('DELETE', 'booking', `bookings?id=eq.${bookingId}`);
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
