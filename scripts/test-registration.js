#!/usr/bin/env node

const API_BASE = 'http://localhost:5000';

async function testRegistration() {
  const email = `test_${Date.now()}@test.local`;
  
  const response = await fetch(`${API_BASE}/api/auth/v1/register/customer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      full_name: 'Test Customer',
      email,
      password: 'Test123!@#',
      contact_number: '+639171234567',
      role: 'customer',
    }),
  });

  const text = await response.text();
  console.log('Status:', response.status);
  console.log('Response:', text);
  
  try {
    const data = JSON.parse(text);
    console.log('\nParsed:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.log('Could not parse as JSON');
  }
}

testRegistration().catch(console.error);
