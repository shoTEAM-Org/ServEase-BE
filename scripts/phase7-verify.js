#!/usr/bin/env node
/**
 * Phase 7 verification - support, disputes, reviews, and provider reports.
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
  let ticketId = null;
  let disputeId = null;
  let reportId = null;

  console.log('--- Phase 7 support/trust DB verification ---');

  await req('POST', 'identity_and_user', 'users', [
    {
      id: customerId,
      email: `ph7_customer_${stamp}@test.local`,
      full_name: 'P7 Customer',
      role: 'customer',
      status: 'active',
      is_verified: true,
    },
    {
      id: providerId,
      email: `ph7_provider_${stamp}@test.local`,
      full_name: 'P7 Provider',
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
      business_name: 'P7 Provider Co',
      verification_status: 'approved',
    },
  ]);
  await req('POST', 'provider_catalog', 'service_categories', [
    {
      id: categoryId,
      name: `P7 Category ${stamp}`,
      slug: `ph7-category-${stamp}`,
    },
  ]);
  await req('POST', 'booking', 'bookings', [
    {
      id: bookingId,
      booking_reference: `PH7-${stamp}`,
      customer_id: customerId,
      provider_id: providerId,
      service_id: categoryId,
      service_title: 'P7 Service',
      service_name: 'P7 Service',
      service_description: 'Support and trust verification booking',
      service_address: 'Phase 7 Test Address',
      service_location_type: 'mobile',
      scheduled_at: new Date(Date.now() + 86400000).toISOString(),
      hours_required: 1,
      service_amount: 450,
      total_amount: 450,
      payment_method: 'cash_on_service',
      status: 'completed',
      started_at: new Date(Date.now() - 3600000).toISOString(),
      completed_at: new Date().toISOString(),
    },
  ]);

  const t1 = await req('POST', 'notification_and_support', 'support_tickets', [
    {
      user_id: customerId,
      subject: 'Need help with booking',
      message: 'The booking needs support verification.',
    },
  ]);
  ticketId = t1.body?.[0]?.ticket_id || null;
  ok(
    "support ticket defaults to status='open' and priority='normal'",
    t1.status === 201 &&
      t1.body?.[0]?.status === 'open' &&
      t1.body?.[0]?.priority === 'normal',
    `status=${t1.status} body=${JSON.stringify(t1.body)}`,
  );

  const badTicket = await req('POST', 'notification_and_support', 'support_tickets', [
    {
      user_id: customerId,
      subject: 'Bad status',
      message: 'This should fail.',
      status: 'pending',
    },
  ]);
  ok(
    'regression: invalid support ticket status rejected',
    badTicket.status >= 400,
    `status=${badTicket.status}`,
  );

  const d1 = await req('POST', 'notification_and_support', 'disputes', [
    {
      booking_id: bookingId,
      customer_id: customerId,
      provider_id: providerId,
      reason: 'Service quality',
      description: 'Phase 7 dispute verification.',
    },
  ]);
  disputeId = d1.body?.[0]?.id || null;
  ok(
    "dispute defaults to status='open'",
    d1.status === 201 && d1.body?.[0]?.status === 'open',
    `status=${d1.status}`,
  );

  const d2 = await req(
    'PATCH',
    'notification_and_support',
    `disputes?id=eq.${disputeId}`,
    { status: 'under_review' },
  );
  ok(
    'dispute can move to under_review enum value',
    d2.status === 200 && d2.body?.[0]?.status === 'under_review',
    `status=${d2.status}`,
  );

  const badDispute = await req(
    'PATCH',
    'notification_and_support',
    `disputes?id=eq.${disputeId}`,
    { status: 'investigating' },
  );
  ok(
    'regression: invalid dispute status rejected',
    badDispute.status >= 400,
    `status=${badDispute.status}`,
  );

  const r1 = await req('POST', 'trust_and_reputation', 'reviews', [
    {
      booking_id: bookingId,
      reviewer_id: customerId,
      reviewee_id: providerId,
      rating: 5,
      review_text: 'Excellent phase 7 service.',
    },
  ]);
  ok(
    'review inserts with rating between 1 and 5',
    r1.status === 201 && r1.body?.[0]?.rating === 5,
    `status=${r1.status}`,
  );

  const duplicateReview = await req('POST', 'trust_and_reputation', 'reviews', [
    {
      booking_id: bookingId,
      reviewer_id: customerId,
      reviewee_id: providerId,
      rating: 4,
      review_text: 'Duplicate should fail.',
    },
  ]);
  ok(
    'regression: duplicate review for booking/reviewer rejected',
    duplicateReview.status >= 400,
    `status=${duplicateReview.status}`,
  );

  const badRating = await req('POST', 'trust_and_reputation', 'reviews', [
    {
      booking_id: bookingId,
      reviewer_id: providerId,
      reviewee_id: customerId,
      rating: 6,
      review_text: 'Invalid rating should fail.',
    },
  ]);
  ok(
    'regression: rating outside 1..5 rejected',
    badRating.status >= 400,
    `status=${badRating.status}`,
  );

  const p1 = await req('POST', 'trust_and_reputation', 'provider_profile_reports', [
    {
      booking_id: bookingId,
      reporter_id: customerId,
      provider_id: providerId,
      reason: 'Safety concern',
      details: 'Phase 7 report verification.',
    },
  ]);
  reportId = p1.body?.[0]?.id || null;
  ok(
    "provider profile report defaults to status='open'",
    p1.status === 201 && p1.body?.[0]?.status === 'open',
    `status=${p1.status}`,
  );

  const badReport = await req(
    'PATCH',
    'trust_and_reputation',
    `provider_profile_reports?id=eq.${reportId}`,
    { status: 'investigating' },
  );
  ok(
    'regression: invalid provider report status rejected',
    badReport.status >= 400,
    `status=${badReport.status}`,
  );

  console.log('--- cleanup ---');
  if (reportId) {
    await req(
      'DELETE',
      'trust_and_reputation',
      `provider_profile_reports?id=eq.${reportId}`,
    );
  }
  await req('DELETE', 'trust_and_reputation', `reviews?booking_id=eq.${bookingId}`);
  if (disputeId) {
    await req(
      'DELETE',
      'notification_and_support',
      `disputes?id=eq.${disputeId}`,
    );
  }
  if (ticketId) {
    await req(
      'DELETE',
      'notification_and_support',
      `support_tickets?ticket_id=eq.${ticketId}`,
    );
  }
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
