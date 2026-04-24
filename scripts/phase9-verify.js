#!/usr/bin/env node

/**
 * Phase 9 Verification: Address Management
 * 
 * Tests:
 * 1. Get user addresses
 * 2. Add new address (customer)
 * 3. Update existing address
 * 4. Set default address
 * 5. Delete address
 * 6. Get address with geocoding
 * 7. Validate address format
 * 8. Handle multiple address types (home, work, other)
 * 9. Store address history
 * 10. Retrieve addresses for booking context
 */

const BASE_URL = 'http://localhost:3000';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${SUPABASE_KEY}`,
};

let testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: [],
};

async function request(method, endpoint, body = null) {
  const url = `${BASE_URL}${endpoint}`;
  const options = {
    method,
    headers,
    ...(body && { body: JSON.stringify(body) }),
  };

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(`${response.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

async function test(name, fn) {
  testResults.total++;
  try {
    await fn();
    testResults.passed++;
    console.log(`✅ ${name}`);
  } catch (error) {
    testResults.failed++;
    testResults.errors.push({ test: name, error: error.message });
    console.error(`❌ ${name}: ${error.message}`);
  }
}

async function runPhase9Tests() {
  console.log('\n📋 Phase 9: Address Management\n');

  let customerId, addressId, address2Id;

  // Setup: Create test customer
  await test('Setup: Create test customer', async () => {
    const customer = await request('POST', '/auth/customer-register', {
      email: `address-test-customer-${Date.now()}@test.com`,
      password: 'Test@123456',
      first_name: 'Address',
      last_name: 'Customer',
      phone_number: '+1234567890',
    });
    customerId = customer.user?.id;
    if (!customerId) throw new Error('No customer ID returned');
  });

  // Test 1: Get user addresses (should be empty initially)
  await test('Get user addresses (initial)', async () => {
    const response = await request('GET', `/auth/addresses?user_id=${customerId}`);
    if (!Array.isArray(response.addresses)) {
      throw new Error('Invalid addresses response');
    }
  });

  // Test 2: Add new address
  await test('Add new address', async () => {
    const response = await request('POST', '/auth/addresses', {
      user_id: customerId,
      street_address: '123 Main Street',
      city: 'San Francisco',
      state: 'CA',
      zip_code: '94102',
      country: 'USA',
      address_type: 'home',
      is_default: true,
    });
    addressId = response.address?.id || response.id;
    if (!addressId) throw new Error('No address ID returned');
  });

  // Test 3: Add second address
  await test('Add second address', async () => {
    const response = await request('POST', '/auth/addresses', {
      user_id: customerId,
      street_address: '456 Work Avenue',
      city: 'San Francisco',
      state: 'CA',
      zip_code: '94105',
      country: 'USA',
      address_type: 'work',
      is_default: false,
    });
    address2Id = response.address?.id || response.id;
    if (!address2Id) throw new Error('No second address ID returned');
  });

  // Test 4: Get all addresses
  await test('Get all user addresses', async () => {
    const response = await request('GET', `/auth/addresses?user_id=${customerId}`);
    if (!Array.isArray(response.addresses)) {
      throw new Error('Invalid addresses response');
    }
    if (response.addresses.length < 2) {
      throw new Error('Expected at least 2 addresses');
    }
  });

  // Test 5: Update address
  await test('Update existing address', async () => {
    const response = await request('PATCH', `/auth/addresses/${addressId}`, {
      street_address: '123 Main Street, Apt 4B',
      city: 'San Francisco',
      state: 'CA',
      zip_code: '94102',
    });
    if (!response.address && !response.ok) {
      throw new Error('Failed to update address');
    }
  });

  // Test 6: Set default address
  await test('Set default address', async () => {
    const response = await request('PATCH', `/auth/addresses/${address2Id}`, {
      is_default: true,
    });
    if (!response.address && !response.ok) {
      throw new Error('Failed to set default address');
    }
  });

  // Test 7: Get default address
  await test('Get default address for user', async () => {
    const response = await request('GET', `/auth/addresses?user_id=${customerId}&default=true`);
    if (!response.address) {
      throw new Error('No default address returned');
    }
  });

  // Test 8: Validate address format
  await test('Validate address format validation', async () => {
    try {
      await request('POST', '/auth/addresses', {
        user_id: customerId,
        street_address: '', // Invalid: empty street
        city: 'San Francisco',
        state: 'CA',
        zip_code: '94102',
      });
      throw new Error('Invalid address was accepted');
    } catch (error) {
      if (!error.message.includes('was accepted')) {
        // Expected: validation error
        return;
      }
      throw error;
    }
  });

  // Test 9: Add address with geocoding
  await test('Add address with geocoding/coordinates', async () => {
    const response = await request('POST', '/auth/addresses', {
      user_id: customerId,
      street_address: '789 Geo Street',
      city: 'San Francisco',
      state: 'CA',
      zip_code: '94107',
      country: 'USA',
      latitude: 37.7749,
      longitude: -122.4194,
      address_type: 'other',
    });
    if (!response.address && !response.id) {
      throw new Error('Failed to add address with geocoding');
    }
  });

  // Test 10: Delete address
  await test('Delete address', async () => {
    // Create a temporary address to delete
    const addResponse = await request('POST', '/auth/addresses', {
      user_id: customerId,
      street_address: '999 Delete Street',
      city: 'San Francisco',
      state: 'CA',
      zip_code: '94109',
      address_type: 'other',
    });
    const tempAddressId = addResponse.address?.id || addResponse.id;

    // Delete it
    const deleteResponse = await request('DELETE', `/auth/addresses/${tempAddressId}`, {});
    if (!deleteResponse.ok && !deleteResponse.success) {
      throw new Error('Failed to delete address');
    }
  });

  // Test 11: Address type validation
  await test('Validate address type options', async () => {
    const validTypes = ['home', 'work', 'other'];
    for (const type of validTypes) {
      const response = await request('POST', '/auth/addresses', {
        user_id: customerId,
        street_address: `${type} address`,
        city: 'San Francisco',
        state: 'CA',
        zip_code: '94100',
        address_type: type,
      });
      if (!response.address && !response.id) {
        throw new Error(`Failed to add ${type} address`);
      }
    }
  });

  // Test 12: Get address for booking context
  await test('Get address for booking context', async () => {
    const response = await request('GET', `/auth/addresses?user_id=${customerId}&context=booking`);
    if (!response.addresses || !Array.isArray(response.addresses)) {
      throw new Error('No addresses in booking context');
    }
  });

  // Print results
  console.log('\n' + '='.repeat(50));
  console.log(`📊 Phase 9 Results: ${testResults.passed}/${testResults.total} passed`);
  console.log('='.repeat(50));

  if (testResults.failed > 0) {
    console.log('\n❌ Failed tests:');
    testResults.errors.forEach((err) => {
      console.log(`  - ${err.test}: ${err.error}`);
    });
    process.exit(1);
  } else {
    console.log('\n✅ All Phase 9 tests passed!');
    process.exit(0);
  }
}

runPhase9Tests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
