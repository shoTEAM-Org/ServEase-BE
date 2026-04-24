#!/usr/bin/env node
/**
 * DB inspector — uses service_role key via PostgREST to probe live schema.
 * Only works for schemas listed under Dashboard → Settings → API → Exposed schemas.
 */
const fs = require('fs');
const path = require('path');

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
if (!URL || !KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in .env');
  process.exit(1);
}

const SCHEMAS = [
  'identity_and_user',
  'provider_catalog',
  'booking',
  'payment',
  'notification_and_support',
  'trust_and_reputation',
  'messages',
  'public',
];

const TABLES_PER_SCHEMA = {
  identity_and_user: ['users', 'customer_profiles', 'user_addresses'],
  provider_catalog: [
    'provider_profiles',
    'service_categories',
    'provider_services',
    'provider_documents',
    'location',
    'psgc_provinces',
    'psgc_cities',
    'psgc_barangays',
  ],
  booking: [
    'bookings',
    'provider_availability',
    'provider_days_off',
    'booking_attachments',
    'additional_charges',
    'bookings_cancellations',
  ],
  payment: ['payments', 'provider_payouts'],
  notification_and_support: ['notifications', 'support_tickets', 'disputes'],
  trust_and_reputation: ['reviews', 'provider_profile_reports'],
  messages: ['conversations', 'messages'],
};

async function probe(schema, table) {
  const endpoint = `${URL}/rest/v1/${table}?limit=1&select=*`;
  const res = await fetch(endpoint, {
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Accept-Profile': schema,
    },
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

async function probeRoot() {
  const res = await fetch(`${URL}/rest/v1/`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  const body = await res.text();
  return { status: res.status, bodyHead: body.slice(0, 200) };
}

(async () => {
  const root = await probeRoot();
  console.log(
    `[root] status=${root.status} preview=${root.bodyHead.slice(0, 80)}`,
  );

  const results = {};
  for (const schema of SCHEMAS) {
    results[schema] = {};
    for (const table of TABLES_PER_SCHEMA[schema] || []) {
      try {
        const r = await probe(schema, table);
        results[schema][table] = {
          status: r.status,
          ok: r.status === 200 || r.status === 206,
          err: r.status >= 400 ? r.body?.message || r.body?.code : null,
          count:
            r.status === 200 && Array.isArray(r.body) ? r.body.length : null,
        };
      } catch (e) {
        results[schema][table] = { error: String(e) };
      }
    }
  }
  console.log(JSON.stringify(results, null, 2));
})();
