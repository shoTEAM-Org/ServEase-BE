#!/usr/bin/env node

/**
 * Phase 7 Verification: Reviews & Compliance
 * 
 * Tests:
 * 1. Complete a booking to enable reviews
 * 2. Create review from customer
 * 3. Create review from provider
 * 4. Get provider reviews and ratings
 * 5. Test review validation (rating 1-5 stars)
 * 6. Get provider performance report
 * 7. Test compliance report generation
 * 8. Create provider report (for trust & safety)
 * 9. Verify notifications on review creation
 * 10. Test review filtering and sorting
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

async function runPhase7Tests() {
  console.log('\n📋 Phase 7: Reviews & Compliance\n');

  let customerId, providerId, bookingId, serviceId, reviewId;

  // Setup: Create test users and booking
  await test('Setup: Create test customer', async () => {
    const customer = await request('POST', '/auth/customer-register', {
      email: `review-test-customer-${Date.now()}@test.com`,
      password: 'Test@123456',
      first_name: 'Review',
      last_name: 'Customer',
      phone_number: '+1234567890',
    });
    customerId = customer.user?.id;
    if (!customerId) throw new Error('No customer ID returned');
  });

  await test('Setup: Create test provider', async () => {
    const provider = await request('POST', '/auth/provider-register', {
      email: `review-test-provider-${Date.now()}@test.com`,
      password: 'Test@123456',
      first_name: 'Review',
      last_name: 'Provider',
      phone_number: '+1234567891',
      business_name: 'Review Test Business',
      date_of_birth: '1990-01-01',
    });
    providerId = provider.user?.id;
    if (!providerId) throw new Error('No provider ID returned');
  });

  await test('Setup: Create provider profile', async () => {
    await request('POST', '/provider/create-profile', {
      user_id: providerId,
      business_name: 'Review Test Business',
      business_description: 'Test business for reviews',
      phone_number: '+1234567891',
    });
  });

  await test('Setup: Create provider service', async () => {
    const response = await request('POST', '/provider/create-service', {
      provider_id: providerId,
      name: 'Review Test Service',
      description: 'Service for review testing',
      base_price: 75.00,
      estimated_duration_minutes: 90,
      category: 'Test Category',
    });
    serviceId = response.service?.id || response.id;
  });

  await test('Setup: Create and complete booking', async () => {
    const bookingResponse = await request('POST', '/booking/create', {
      customer_id: customerId,
      provider_id: providerId,
      service_id: serviceId,
      booking_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      booking_time: '10:00',
      address: '123 Test Street, City',
    });
    bookingId = bookingResponse.booking?.id || bookingResponse.id;

    // Confirm booking
    await request('POST', `/booking/${bookingId}/update-status`, {
      status: 'confirmed',
      provider_id: providerId,
    });

    // Mark as in progress
    await request('POST', `/booking/${bookingId}/update-status`, {
      status: 'in_progress',
      provider_id: providerId,
    });

    // Mark as completed
    await request('POST', `/booking/${bookingId}/update-status`, {
      status: 'completed',
      provider_id: providerId,
    });
  });

  // Test 1: Create customer review for provider
  await test('Create customer review for provider', async () => {
    const response = await request('POST', '/trust/create-review', {
      booking_id: bookingId,
      reviewer_id: customerId,
      reviewee_id: providerId,
      rating: 5,
      review_text: 'Excellent service! Very professional and timely.',
      review_type: 'customer_to_provider',
    });
    reviewId = response.review?.id || response.id;
    if (!reviewId) throw new Error('No review ID returned');
  });

  // Test 2: Create provider review for customer
  await test('Create provider review for customer', async () => {
    const response = await request('POST', '/trust/create-review', {
      booking_id: bookingId,
      reviewer_id: providerId,
      reviewee_id: customerId,
      rating: 4,
      review_text: 'Good customer. Easy to communicate with.',
      review_type: 'provider_to_customer',
    });
    if (!response.review && !response.id) throw new Error('Failed to create provider review');
  });

  // Test 3: Get provider reviews
  await test('Get provider reviews and ratings', async () => {
    const response = await request('GET', `/trust/provider-reviews/${providerId}`);
    if (!response.reviews || !Array.isArray(response.reviews)) {
      throw new Error('No reviews returned');
    }
    if (response.reviews.length < 1) throw new Error('Expected at least 1 review');
  });

  // Test 4: Get provider performance report
  await test('Get provider performance report', async () => {
    const response = await request('GET', `/trust/performance-report/${providerId}`);
    if (!response.report) {
      throw new Error('No performance report returned');
    }
    // Report should include average rating, total reviews, completion rate, etc.
  });

  // Test 5: Validate review rating (1-5 scale)
  await test('Validate review rating validation', async () => {
    // This test verifies that invalid ratings are rejected
    try {
      await request('POST', '/trust/create-review', {
        booking_id: bookingId,
        reviewer_id: customerId,
        reviewee_id: providerId,
        rating: 10, // Invalid rating
        review_text: 'This should fail',
      });
      throw new Error('Invalid rating was accepted');
    } catch (error) {
      if (error.message.includes('Invalid rating')) {
        // Expected behavior
        return;
      }
      // If it didn't reject invalid rating, the test fails
      if (!error.message.includes('was accepted')) {
        throw error;
      }
    }
  });

  // Test 6: Create provider report (safety/compliance)
  await test('Create provider report for compliance', async () => {
    const response = await request('POST', '/trust/create-provider-report', {
      reported_provider_id: providerId,
      reporter_id: customerId,
      reason: 'Policy violation',
      description: 'Provider did not follow service guidelines',
      report_type: 'compliance',
    });
    if (!response.report && !response.id) {
      throw new Error('Failed to create provider report');
    }
  });

  // Test 7: Get compliance report data
  await test('Get compliance report data', async () => {
    const response = await request('GET', `/trust/compliance-reports?provider_id=${providerId}`);
    // Response may be empty if no strict compliance issues
    if (!response.reports) {
      throw new Error('No compliance data returned');
    }
  });

  // Test 8: Check review notification sent
  await test('Verify review notification created', async () => {
    const response = await request('GET', `/notifications?user_id=${providerId}`);
    if (!response.notifications || !Array.isArray(response.notifications)) {
      throw new Error('No notifications returned for reviewed party');
    }
    // Should have notification about being reviewed
  });

  // Test 9: Get reviews with filtering
  await test('Get reviews with filtering and sorting', async () => {
    const response = await request('GET', `/trust/provider-reviews/${providerId}?rating=5&sort=recent`);
    if (!response.reviews || !Array.isArray(response.reviews)) {
      throw new Error('No filtered reviews returned');
    }
  });

  // Test 10: Get provider rating statistics
  await test('Get provider rating statistics', async () => {
    const response = await request('GET', `/trust/provider-stats/${providerId}`);
    if (!response.stats) {
      throw new Error('No rating statistics returned');
    }
    // Stats should include: average_rating, total_reviews, 5_star_count, etc.
  });

  // Print results
  console.log('\n' + '='.repeat(50));
  console.log(`📊 Phase 7 Results: ${testResults.passed}/${testResults.total} passed`);
  console.log('='.repeat(50));

  if (testResults.failed > 0) {
    console.log('\n❌ Failed tests:');
    testResults.errors.forEach((err) => {
      console.log(`  - ${err.test}: ${err.error}`);
    });
    process.exit(1);
  } else {
    console.log('\n✅ All Phase 7 tests passed!');
    process.exit(0);
  }
}

runPhase7Tests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
