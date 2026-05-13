#!/usr/bin/env node
/**
 * Phase 6 verification - chat DB contract.
 *
 * Verifies booking-scoped conversations and messages in the messages schema.
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
  let conversationId = null;

  console.log('--- Phase 6 chat DB verification ---');

  await req('POST', 'identity_and_user', 'users', [
    {
      id: customerId,
      email: `ph6_customer_${stamp}@test.local`,
      full_name: 'P6 Customer',
      role: 'customer',
      status: 'active',
      is_verified: true,
    },
    {
      id: providerId,
      email: `ph6_provider_${stamp}@test.local`,
      full_name: 'P6 Provider',
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
      business_name: 'P6 Provider Co',
      verification_status: 'approved',
    },
  ]);
  await req('POST', 'provider_catalog', 'service_categories', [
    {
      id: categoryId,
      name: `P6 Category ${stamp}`,
      slug: `ph6-category-${stamp}`,
    },
  ]);
  await req('POST', 'booking', 'bookings', [
    {
      id: bookingId,
      booking_reference: `PH6-${stamp}`,
      customer_id: customerId,
      provider_id: providerId,
      service_id: categoryId,
      service_title: 'P6 Service',
      service_name: 'P6 Service',
      service_description: 'Chat verification booking',
      service_address: 'Phase 6 Test Address',
      service_location_type: 'mobile',
      scheduled_at: new Date(Date.now() + 86400000).toISOString(),
      hours_required: 1,
      service_amount: 350,
      total_amount: 350,
      payment_method: 'cash_on_service',
      status: 'confirmed',
    },
  ]);

  const c1 = await req('POST', 'messages', 'conversations', [
    {
      context_type: 'booking',
      context_id: bookingId,
      status: 'active',
    },
  ]);
  conversationId = c1.body?.[0]?.id || null;
  ok(
    "create booking conversation with context_type='booking'",
    c1.status === 201 && !!conversationId,
    `status=${c1.status} id=${conversationId}`,
  );

  const cDup = await req('POST', 'messages', 'conversations', [
    {
      context_type: 'booking',
      context_id: bookingId,
      status: 'active',
    },
  ]);
  ok(
    'regression: duplicate conversation rejected by UNIQUE(context_type, context_id)',
    cDup.status >= 400,
    `status=${cDup.status}`,
  );

  const cBad = await req('POST', 'messages', 'conversations', [
    {
      booking_id: bookingId,
      customer_id: customerId,
      provider_id: providerId,
    },
  ]);
  ok(
    'regression: old booking_id/customer_id/provider_id columns are rejected',
    cBad.status >= 400,
    `status=${cBad.status}`,
  );

  const m1 = await req('POST', 'messages', 'messages', [
    {
      conversation_id: conversationId,
      sender_id: customerId,
      message_type: 'text',
      body: 'Hello from the customer.',
      delivery_status: 'sent',
    },
    {
      conversation_id: conversationId,
      sender_id: providerId,
      message_type: 'text',
      body: 'Hello from the provider.',
      delivery_status: 'sent',
    },
  ]);
  ok(
    'insert messages with conversation_id/sender_id/body/delivery_status',
    m1.status === 201 && Array.isArray(m1.body) && m1.body.length === 2,
    `status=${m1.status}`,
  );

  const badStatus = await req('POST', 'messages', 'messages', [
    {
      conversation_id: conversationId,
      sender_id: customerId,
      message_type: 'text',
      body: 'Bad delivery status should fail.',
      delivery_status: 'opened',
    },
  ]);
  ok(
    'regression: invalid delivery_status rejected',
    badStatus.status >= 400,
    `status=${badStatus.status}`,
  );

  const markRead = await req(
    'PATCH',
    'messages',
    `messages?conversation_id=eq.${conversationId}&sender_id=neq.${customerId}&delivery_status=neq.read`,
    { delivery_status: 'read' },
  );
  ok('mark-read updates only other party messages', markRead.status === 200);

  const messages = await req(
    'GET',
    'messages',
    `messages?conversation_id=eq.${conversationId}&select=sender_id,delivery_status&order=created_at.asc`,
  );
  const rows = Array.isArray(messages.body) ? messages.body : [];
  const customerRowsRemainSent = rows
    .filter((row) => row.sender_id === customerId)
    .every((row) => row.delivery_status === 'sent');
  const providerRowsAreRead = rows
    .filter((row) => row.sender_id === providerId)
    .every((row) => row.delivery_status === 'read');
  ok(
    'mark-read leaves reader messages alone and reads sender messages',
    messages.status === 200 && customerRowsRemainSent && providerRowsAreRead,
    `status=${messages.status} rows=${JSON.stringify(rows)}`,
  );

  console.log('--- cleanup ---');
  if (conversationId) {
    await req('DELETE', 'messages', `messages?conversation_id=eq.${conversationId}`);
    await req('DELETE', 'messages', `conversations?id=eq.${conversationId}`);
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
