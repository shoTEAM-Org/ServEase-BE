#!/usr/bin/env node
/**
 * Phase 8 verification - catalog, addresses, PSGC, and storage.
 */
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { createClient } = require('@supabase/supabase-js');

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
const supabase = createClient(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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

async function uploadAndRoundTrip(bucket, objectPath, body, signed) {
  const upload = await supabase.storage
    .from(bucket)
    .upload(objectPath, body, {
      contentType: 'text/plain',
      upsert: true,
    });
  if (upload.error) return { upload, download: null, signedUrl: null };

  const download = await supabase.storage.from(bucket).download(objectPath);
  let signedUrl = null;
  if (signed) {
    signedUrl = await supabase.storage
      .from(bucket)
      .createSignedUrl(objectPath, 60);
  }
  return { upload, download, signedUrl };
}

(async () => {
  const stamp = Date.now();
  const customerId = randomUUID();
  const providerId = randomUUID();
  const activeLowId = randomUUID();
  const activeHighId = randomUUID();
  const inactiveId = randomUUID();
  let serviceId = null;
  let addressId = null;
  const provinceCode = `P8P${String(stamp).slice(-8)}`;
  const cityCode = `P8C${String(stamp).slice(-8)}`;
  const barangayCode = `P8B${String(stamp).slice(-8)}`;
  const bucketObjects = [
    ['avatars', `phase8/${stamp}/avatar.txt`, false],
    ['booking-attachments', `phase8/${stamp}/attachment.txt`, true],
    ['verification-docs', `phase8/${stamp}/verification.txt`, true],
  ];

  console.log('--- Phase 8 catalog/address/storage DB verification ---');

  await req('POST', 'identity_and_user', 'users', [
    {
      id: customerId,
      email: `ph8_customer_${stamp}@test.local`,
      full_name: 'P8 Customer',
      contact_number: '09170000081',
      role: 'customer',
      status: 'active',
      is_verified: true,
    },
    {
      id: providerId,
      email: `ph8_provider_${stamp}@test.local`,
      full_name: 'P8 Provider',
      contact_number: '09170000082',
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
      business_name: 'P8 Provider Co',
      verification_status: 'approved',
    },
  ]);

  const categories = await req('POST', 'provider_catalog', 'service_categories', [
    {
      id: activeHighId,
      name: `P8 Active High ${stamp}`,
      slug: `phase8-active-high-${stamp}`,
      display_order: 20,
      is_active: true,
    },
    {
      id: activeLowId,
      name: `P8 Active Low ${stamp}`,
      slug: `phase8-active-low-${stamp}`,
      display_order: 10,
      is_active: true,
    },
    {
      id: inactiveId,
      name: `P8 Inactive ${stamp}`,
      slug: `phase8-inactive-${stamp}`,
      display_order: 5,
      is_active: false,
    },
  ]);
  ok('seed active and inactive categories', categories.status === 201);

  const activeCategories = await req(
    'GET',
    'provider_catalog',
    `service_categories?slug=like.phase8-*-${stamp}&is_active=eq.true&select=id,slug,display_order,is_active&order=display_order.asc`,
  );
  const categoryRows = Array.isArray(activeCategories.body)
    ? activeCategories.body
    : [];
  ok(
    'active categories are queryable in display_order order',
    activeCategories.status === 200 &&
      categoryRows.length === 2 &&
      categoryRows[0]?.id === activeLowId &&
      categoryRows[1]?.id === activeHighId,
    `status=${activeCategories.status} rows=${JSON.stringify(categoryRows)}`,
  );

  const service = await req('POST', 'provider_catalog', 'provider_services', [
    {
      provider_id: providerId,
      service_id: activeLowId,
      title: 'P8 Hourly Service',
      description: 'Provider service verification.',
      pricing_mode: 'hourly',
      price: 700,
      duration_minutes: 60,
      is_active: true,
    },
  ]);
  serviceId = service.body?.[0]?.id || null;
  ok(
    'provider_service inserts with service_id/pricing_mode/price',
    service.status === 201 && !!serviceId,
    `status=${service.status} id=${serviceId}`,
  );

  const badService = await req('POST', 'provider_catalog', 'provider_services', [
    {
      provider_id: providerId,
      service_id: activeLowId,
      title: 'P8 Bad Pricing',
      pricing_mode: 'package',
      price: 100,
    },
  ]);
  ok(
    'regression: invalid provider_services.pricing_mode rejected',
    badService.status >= 400,
    `status=${badService.status}`,
  );

  const address = await req('POST', 'identity_and_user', 'user_addresses', [
    {
      user_id: customerId,
      label: 'Home',
      recipient_name: 'P8 Customer',
      contact_number: '09170000081',
      address_line: '123 Phase 8 Street',
      barangay: 'Test Barangay',
      city: 'Test City',
      province: 'Test Province',
      region: 'Test Region',
      zip_code: '1000',
      is_default: true,
    },
  ]);
  addressId = address.body?.[0]?.id || null;
  ok(
    'user address persists with address_line and is_default',
    address.status === 201 &&
      !!addressId &&
      address.body?.[0]?.address_line === '123 Phase 8 Street' &&
      address.body?.[0]?.is_default === true,
    `status=${address.status}`,
  );

  const oldAddressColumn = await req('POST', 'identity_and_user', 'user_addresses', [
    {
      user_id: customerId,
      street_address: 'Old column should fail',
    },
  ]);
  ok(
    'regression: old street_address column rejected on user_addresses',
    oldAddressColumn.status >= 400,
    `status=${oldAddressColumn.status}`,
  );

  const psgcProvince = await req('POST', 'provider_catalog', 'psgc_provinces', [
    { code: provinceCode, name: `Phase 8 Province ${stamp}` },
  ]);
  const psgcCity = await req('POST', 'provider_catalog', 'psgc_cities', [
    { code: cityCode, province_code: provinceCode, name: `Phase 8 City ${stamp}` },
  ]);
  const psgcBarangay = await req('POST', 'provider_catalog', 'psgc_barangays', [
    { code: barangayCode, city_code: cityCode, name: `Phase 8 Barangay ${stamp}` },
  ]);
  ok(
    'seed PSGC province/city/barangay',
    psgcProvince.status === 201 &&
      psgcCity.status === 201 &&
      psgcBarangay.status === 201,
    `province=${psgcProvince.status} city=${psgcCity.status} barangay=${psgcBarangay.status}`,
  );

  const deleteCity = await req('DELETE', 'provider_catalog', `psgc_cities?code=eq.${cityCode}`);
  const remainingBarangay = await req(
    'GET',
    'provider_catalog',
    `psgc_barangays?code=eq.${barangayCode}&select=code`,
  );
  ok(
    'PSGC cascade deletes barangays when city is deleted',
    deleteCity.status === 200 &&
      remainingBarangay.status === 200 &&
      Array.isArray(remainingBarangay.body) &&
      remainingBarangay.body.length === 0,
    `deleteCity=${deleteCity.status} remaining=${JSON.stringify(remainingBarangay.body)}`,
  );

  for (const [bucket, objectPath, signed] of bucketObjects) {
    const result = await uploadAndRoundTrip(
      bucket,
      objectPath,
      Buffer.from(`phase8 ${bucket} ${stamp}`),
      signed,
    );
    ok(
      `${bucket} upload/download${signed ? '/signed-url' : ''} works`,
      !result.upload.error &&
        !result.download?.error &&
        (!signed || Boolean(result.signedUrl?.data?.signedUrl)),
      `upload=${result.upload.error?.message || 'ok'} download=${result.download?.error?.message || 'ok'}`,
    );
  }

  console.log('--- cleanup ---');
  for (const [bucket, objectPath] of bucketObjects) {
    await supabase.storage.from(bucket).remove([objectPath]);
  }
  if (serviceId) {
    await req('DELETE', 'provider_catalog', `provider_services?id=eq.${serviceId}`);
  }
  await req(
    'DELETE',
    'provider_catalog',
    `service_categories?id=in.(${activeHighId},${activeLowId},${inactiveId})`,
  );
  await req(
    'DELETE',
    'identity_and_user',
    `user_addresses?user_id=eq.${customerId}`,
  );
  await req('DELETE', 'provider_catalog', `psgc_provinces?code=eq.${provinceCode}`);
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
