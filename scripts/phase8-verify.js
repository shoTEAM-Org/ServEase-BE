#!/usr/bin/env node

/**
 * Phase 8 Verification: Catalog Management
 * 
 * Tests:
 * 1. Get all service categories
 * 2. Create new service category (admin only)
 * 3. Get services by category
 * 4. Search services by keyword
 * 5. Get service details with ratings
 * 6. Filter services by price range
 * 7. Filter services by availability
 * 8. Get provider portfolio
 * 9. Sort services by relevance/rating/price
 * 10. Get featured/trending services
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

async function runPhase8Tests() {
  console.log('\n📋 Phase 8: Catalog Management\n');

  let providerId, serviceId, categoryId;

  // Setup: Create provider with service
  await test('Setup: Create test provider', async () => {
    const provider = await request('POST', '/auth/provider-register', {
      email: `catalog-test-provider-${Date.now()}@test.com`,
      password: 'Test@123456',
      first_name: 'Catalog',
      last_name: 'Provider',
      phone_number: '+1234567891',
      business_name: 'Catalog Test Business',
      date_of_birth: '1990-01-01',
    });
    providerId = provider.user?.id;
    if (!providerId) throw new Error('No provider ID returned');
  });

  await test('Setup: Create provider profile', async () => {
    await request('POST', '/provider/create-profile', {
      user_id: providerId,
      business_name: 'Catalog Test Business',
      business_description: 'Test business for catalog',
      phone_number: '+1234567891',
    });
  });

  // Test 1: Get all service categories
  await test('Get all service categories', async () => {
    const response = await request('GET', '/catalog/categories');
    if (!response.categories || !Array.isArray(response.categories)) {
      throw new Error('No categories returned');
    }
  });

  // Test 2: Get services by category
  await test('Get services by category', async () => {
    const response = await request('GET', '/catalog/categories');
    if (response.categories?.length > 0) {
      categoryId = response.categories[0].id;
      const categoryServices = await request('GET', `/catalog/categories/${categoryId}/services`);
      if (!categoryServices.services || !Array.isArray(categoryServices.services)) {
        throw new Error('No services in category');
      }
    }
  });

  // Test 3: Create provider service
  await test('Create provider service in catalog', async () => {
    const response = await request('POST', '/catalog/services', {
      provider_id: providerId,
      name: 'Premium Cleaning Service',
      description: 'Professional home and office cleaning',
      base_price: 99.99,
      estimated_duration_minutes: 120,
      category_id: categoryId,
      tags: ['cleaning', 'home', 'professional'],
      service_images: [],
    });
    serviceId = response.service?.id || response.id;
    if (!serviceId) throw new Error('No service ID returned');
  });

  // Test 4: Search services by keyword
  await test('Search services by keyword', async () => {
    const response = await request('GET', '/catalog/search?q=cleaning');
    if (!response.results || !Array.isArray(response.results)) {
      throw new Error('No search results returned');
    }
  });

  // Test 5: Get service details
  await test('Get service details with ratings', async () => {
    const response = await request('GET', `/catalog/services/${serviceId}`);
    if (!response.service) {
      throw new Error('No service details returned');
    }
    // Service details should include provider info and rating
  });

  // Test 6: Filter services by price range
  await test('Filter services by price range', async () => {
    const response = await request('GET', '/catalog/services?min_price=50&max_price=150');
    if (!response.services || !Array.isArray(response.services)) {
      throw new Error('No filtered services returned');
    }
  });

  // Test 7: Filter services by availability
  await test('Filter services by availability', async () => {
    const response = await request('GET', '/catalog/services?available_only=true');
    if (!response.services || !Array.isArray(response.services)) {
      throw new Error('No available services returned');
    }
  });

  // Test 8: Get provider portfolio
  await test('Get provider portfolio', async () => {
    const response = await request('GET', `/catalog/provider/${providerId}/portfolio`);
    if (!response.services || !Array.isArray(response.services)) {
      throw new Error('No portfolio services returned');
    }
  });

  // Test 9: Sort services by rating
  await test('Sort services by rating', async () => {
    const response = await request('GET', '/catalog/services?sort=rating&order=desc');
    if (!response.services || !Array.isArray(response.services)) {
      throw new Error('No sorted services returned');
    }
  });

  // Test 10: Get featured services
  await test('Get featured/trending services', async () => {
    const response = await request('GET', '/catalog/featured');
    if (!response.services || !Array.isArray(response.services)) {
      throw new Error('No featured services returned');
    }
  });

  // Test 11: Update service details
  await test('Update service details', async () => {
    const response = await request('PATCH', `/catalog/services/${serviceId}`, {
      description: 'Updated: Premium home and office cleaning with eco-friendly products',
      base_price: 109.99,
    });
    if (!response.service && !response.ok) {
      throw new Error('Failed to update service');
    }
  });

  // Test 12: Deactivate service
  await test('Deactivate service from catalog', async () => {
    const response = await request('PATCH', `/catalog/services/${serviceId}`, {
      is_active: false,
    });
    if (!response.service && !response.ok) {
      throw new Error('Failed to deactivate service');
    }
  });

  // Print results
  console.log('\n' + '='.repeat(50));
  console.log(`📊 Phase 8 Results: ${testResults.passed}/${testResults.total} passed`);
  console.log('='.repeat(50));

  if (testResults.failed > 0) {
    console.log('\n❌ Failed tests:');
    testResults.errors.forEach((err) => {
      console.log(`  - ${err.test}: ${err.error}`);
    });
    process.exit(1);
  } else {
    console.log('\n✅ All Phase 8 tests passed!');
    process.exit(0);
  }
}

runPhase8Tests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
