#!/usr/bin/env node
/**
 * Phase 1 verification — exercises the auth-flow DB writes directly against
 * the live Supabase project (using service_role), mimicking what
 * auth-service + provider-service do. Confirms schema + constraints are
 * correct before we depend on them at runtime.
 *
 * Tests:
 *   1. Customer signup DB shape: insert into identity_and_user.users + customer_profiles
 *   2. Provider signup DB shape: insert into users (role=provider, status=active),
 *      then provider_catalog.provider_profiles with date_of_birth.
 *   3. Clean up both test users.
 *
 * Exits non-zero on any failure.
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
  const email1 = `phase1_customer_${Date.now()}@test.local`;
  const email2 = `phase1_provider_${Date.now()}@test.local`;

  console.log('--- Phase 1 auth-flow DB verification ---');

  // 1. Customer insert
  const c1 = await req('POST', 'identity_and_user', 'users', [
    {
      id: customerId,
      email: email1,
      full_name: 'Phase1 Customer',
      contact_number: '09170000001',
      role: 'customer',
      status: 'active',
      is_verified: true,
    },
  ]);
  ok(
    'insert customer user (status=active)',
    c1.status === 201,
    `status=${c1.status} err=${JSON.stringify(c1.body).slice(0, 160)}`,
  );

  const c2 = await req('POST', 'identity_and_user', 'customer_profiles', [
    { user_id: customerId },
  ]);
  ok(
    'insert customer_profile (minimal)',
    c2.status === 201,
    `status=${c2.status}`,
  );

  // 2. Provider insert (must use status=active)
  const p1 = await req('POST', 'identity_and_user', 'users', [
    {
      id: providerId,
      email: email2,
      full_name: 'Phase1 Provider',
      contact_number: '09170000002',
      role: 'provider',
      status: 'active',
      is_verified: false,
    },
  ]);
  ok(
    'insert provider user (role=provider,status=active)',
    p1.status === 201,
    `status=${p1.status} err=${JSON.stringify(p1.body).slice(0, 160)}`,
  );

  // Regression: the old code tried status='pending' on users — verify that still fails.
  const providerIdPending = randomUUID();
  const p1bad = await req('POST', 'identity_and_user', 'users', [
    {
      id: providerIdPending,
      email: `phase1_bad_${Date.now()}@test.local`,
      full_name: 'Should Fail',
      contact_number: '09170000099',
      role: 'provider',
      status: 'pending',
      is_verified: false,
    },
  ]);
  ok(
    "regression: users.status='pending' is rejected by CHECK constraint",
    p1bad.status >= 400,
    `status=${p1bad.status}`,
  );

  // 3. Provider profile with DOB — this is the new column.
  const p2 = await req('POST', 'provider_catalog', 'provider_profiles', [
    {
      user_id: providerId,
      business_name: 'Phase1 Biz',
      verification_status: 'pending',
      date_of_birth: '1990-01-15',
    },
  ]);
  const dobOk = ok(
    'insert provider_profiles with date_of_birth',
    p2.status === 201,
    `status=${p2.status} err=${JSON.stringify(p2.body).slice(0, 160)}`,
  );
  if (
    !dobOk &&
    p2.status === 400 &&
    String(p2.body?.message || '').includes('date_of_birth')
  ) {
    console.log(
      '    HINT: migration 20260424_0002_provider_dob.sql not applied yet',
    );
  }

  // 4. Provider document row
  const p3 = await req('POST', 'provider_catalog', 'provider_documents', [
    {
      provider_id: providerId,
      document_type: 'id_card',
      document_file_path: `kyc/${providerId}/test.png`,
      status: 'pending',
    },
  ]);
  ok('insert provider_documents', p3.status === 201, `status=${p3.status}`);

  // 5. Verify login-gate read path: select verification_status
  const p4 = await req(
    'GET',
    'provider_catalog',
    `provider_profiles?user_id=eq.${providerId}&select=verification_status,date_of_birth`,
  );
  ok(
    'read provider verification_status + date_of_birth',
    p4.status === 200 &&
      Array.isArray(p4.body) &&
      p4.body[0]?.verification_status === 'pending',
    `status=${p4.status} got=${JSON.stringify(p4.body)}`,
  );

  // Cleanup
  console.log('--- cleanup ---');
  await req(
    'DELETE',
    'provider_catalog',
    `provider_documents?provider_id=eq.${providerId}`,
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
  await req('DELETE', 'identity_and_user', `users?id=eq.${providerIdPending}`);
  console.log('--- done ---');
})();
