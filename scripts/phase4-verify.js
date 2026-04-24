#!/usr/bin/env node
/**
 * Phase 4 verification — provider_availability + provider_days_off after
 * migration 20260424_0003 aligns columns with BE + mobile expectations.
 *
 * Expected post-migration shape:
 *   booking.provider_availability(id, user_id, day_of_week text CHECK,
 *     start_time time NULL, end_time time NULL, break_start_time time NULL,
 *     break_end_time time NULL, is_active boolean)
 *   booking.provider_days_off(id, user_id, off_date date, reason text,
 *     UNIQUE(user_id, off_date))
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
  const userId = randomUUID();
  console.log('--- Phase 4 availability DB verification ---');

  // Seed provider user so FK-less user_id still makes semantic sense
  await req('POST', 'identity_and_user', 'users', [
    {
      id: userId,
      email: `ph4_prov_${Date.now()}@test.local`,
      full_name: 'P4 Prov',
      contact_number: '09170000031',
      role: 'provider',
      status: 'active',
      is_verified: false,
    },
  ]);

  // 1. INSERT availability with the new shape
  const r1 = await req('POST', 'booking', 'provider_availability', [
    {
      user_id: userId,
      day_of_week: 'Monday',
      is_active: true,
      start_time: '08:00:00',
      end_time: '17:00:00',
      break_start_time: '12:00:00',
      break_end_time: '13:00:00',
    },
  ]);
  ok(
    'insert provider_availability with user_id + text day + break times',
    r1.status === 201,
    `status=${r1.status} err=${JSON.stringify(r1.body).slice(0, 200)}`,
  );

  // 2. Inactive day with null times
  const r2 = await req('POST', 'booking', 'provider_availability', [
    {
      user_id: userId,
      day_of_week: 'Sunday',
      is_active: false,
      start_time: null,
      end_time: null,
      break_start_time: null,
      break_end_time: null,
    },
  ]);
  ok(
    'insert inactive day with null start/end',
    r2.status === 201,
    `status=${r2.status}`,
  );

  // 3. Regression: invalid day name rejected
  const rBad = await req('POST', 'booking', 'provider_availability', [
    {
      user_id: userId,
      day_of_week: 'Funday',
      is_active: true,
    },
  ]);
  ok(
    "regression: day_of_week='Funday' rejected by CHECK",
    rBad.status >= 400,
    `status=${rBad.status}`,
  );

  // 4. Regression: integer day rejected (text column now)
  const rBad2 = await req('POST', 'booking', 'provider_availability', [
    {
      user_id: userId,
      day_of_week: 1,
      is_active: true,
    },
  ]);
  ok(
    'regression: integer day_of_week rejected',
    rBad2.status >= 400,
    `status=${rBad2.status}`,
  );

  // 5. Read back — what mobile expects
  const r3 = await req(
    'GET',
    'booking',
    `provider_availability?user_id=eq.${userId}&select=user_id,day_of_week,is_active,start_time,end_time,break_start_time,break_end_time`,
  );
  ok(
    'read provider_availability rows for user_id',
    r3.status === 200 && Array.isArray(r3.body) && r3.body.length === 2,
    `status=${r3.status} n=${Array.isArray(r3.body) ? r3.body.length : 'n/a'}`,
  );

  // 6. provider_days_off with off_date
  const r4 = await req('POST', 'booking', 'provider_days_off', [
    {
      user_id: userId,
      off_date: '2026-05-01',
      reason: 'Labor Day',
    },
  ]);
  ok(
    'insert provider_days_off with off_date + user_id',
    r4.status === 201,
    `status=${r4.status}`,
  );

  // 7. UNIQUE(user_id, off_date) enforced
  const r5 = await req('POST', 'booking', 'provider_days_off', [
    {
      user_id: userId,
      off_date: '2026-05-01',
      reason: 'dup',
    },
  ]);
  ok(
    'regression: duplicate (user_id, off_date) rejected by UNIQUE',
    r5.status >= 400,
    `status=${r5.status}`,
  );

  // Cleanup
  console.log('--- cleanup ---');
  await req('DELETE', 'booking', `provider_availability?user_id=eq.${userId}`);
  await req('DELETE', 'booking', `provider_days_off?user_id=eq.${userId}`);
  await req('DELETE', 'identity_and_user', `users?id=eq.${userId}`);
  console.log('--- done ---');
})();
