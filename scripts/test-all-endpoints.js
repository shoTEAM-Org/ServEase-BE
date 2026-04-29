#!/usr/bin/env node

/**
 * Comprehensive endpoint test for ServEase backend
 * Tests all critical endpoints to verify they're working
 */

const API_BASE = process.env.API_BASE || 'http://localhost:5000';

async function request(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const options = {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  };

  const response = await fetch(`${API_BASE}${path}`, options);
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return { status: response.status, data, ok: response.ok };
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    return true;
  } catch (error) {
    console.error(`❌ ${name}: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🚀 Testing ServEase Backend Endpoints\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Health check
  if (await test('Health check', async () => {
    const res = await request('GET', '/health/live');
    if (!res.ok) throw new Error(`Status ${res.status}`);
  })) passed++; else failed++;

  // Test 2: Get service categories (public)
  if (await test('Get service categories', async () => {
    const res = await request('GET', '/api/services/v1/categories');
    if (!res.ok) throw new Error(`Status ${res.status}`);
    if (!res.data?.categories) throw new Error('No categories returned');
  })) passed++; else failed++;

  // Test 3: Get provinces (public)
  if (await test('Get provinces', async () => {
    const res = await request('GET', '/api/locations/v1/provinces');
    if (!res.ok) throw new Error(`Status ${res.status}`);
  })) passed++; else failed++;

  // Test 4: Register customer
  const customerEmail = `test_customer_${Date.now()}@test.local`;
  let customerToken;
  if (await test('Register customer', async () => {
    const res = await request('POST', '/api/auth/v1/register/customer', {
      full_name: 'Test Customer',
      email: customerEmail,
      password: 'Test123!@#',
      contact_number: '+639171234567',
      role: 'customer',
    });
    if (!res.ok) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    const token = res.data?.session?.access_token || res.data?.access_token;
    if (!token) throw new Error('No access token returned');
    customerToken = token;
  })) passed++; else failed++;

  // Test 5: Get current user (customer)
  if (await test('Get current user (customer)', async () => {
    const res = await request('GET', '/api/auth/v1/me', null, customerToken);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    if (!res.data?.user) throw new Error('No user data returned');
  })) passed++; else failed++;

  // Test 6: Get customer bookings (should be empty)
  if (await test('Get customer bookings', async () => {
    const res = await request('GET', '/api/booking/v1/customer', null, customerToken);
    if (!res.ok) throw new Error(`Status ${res.status}`);
  })) passed++; else failed++;

  // Test 7: Get notifications (should be empty)
  if (await test('Get notifications', async () => {
    const res = await request('GET', '/api/notifications/v1', null, customerToken);
    if (!res.ok) throw new Error(`Status ${res.status}`);
  })) passed++; else failed++;

  // Test 8: Get unread notification count
  if (await test('Get unread notification count', async () => {
    const res = await request('GET', '/api/notifications/v1/unread-count', null, customerToken);
    if (!res.ok) throw new Error(`Status ${res.status}`);
  })) passed++; else failed++;

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
