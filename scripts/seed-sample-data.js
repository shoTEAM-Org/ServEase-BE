#!/usr/bin/env node
/**
 * Seed a reusable ServEase demo dataset into the live Supabase project.
 *
 * This script uses the service-role key from ../.env, creates real Supabase
 * Auth users for login tests, and writes sample rows into the schema owned by
 * each bounded service. It deletes only rows tagged with this sample seed.
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.resolve(__dirname, '..', '.env');
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.trimStart().startsWith('#') && line.includes('='))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in ServEase-BE/.env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PASSWORD = 'ServeEase@2026!';
const SAMPLE_EMAILS = [
  'admin.sample@servease.test',
  'customer.sample@servease.test',
  'provider.cleaning.sample@servease.test',
  'provider.plumbing.sample@servease.test',
];

const IDS = {
  cleaningCategory: '50000000-0000-4000-8000-000000000001',
  plumbingCategory: '50000000-0000-4000-8000-000000000002',
  electricalCategory: '50000000-0000-4000-8000-000000000003',
  cleaningService: '60000000-0000-4000-8000-000000000001',
  plumbingService: '60000000-0000-4000-8000-000000000002',
  pendingBooking: '70000000-0000-4000-8000-000000000001',
  confirmedBooking: '70000000-0000-4000-8000-000000000002',
  completedBooking: '70000000-0000-4000-8000-000000000003',
  cancelledBooking: '70000000-0000-4000-8000-000000000004',
  conversation: '80000000-0000-4000-8000-000000000001',
  address: '90000000-0000-4000-8000-000000000001',
  location: '90000000-0000-4000-8000-000000000002',
  supportTicket: '90000000-0000-4000-8000-000000000003',
  dispute: '90000000-0000-4000-8000-000000000004',
  review: '90000000-0000-4000-8000-000000000005',
  report: '90000000-0000-4000-8000-000000000006',
  payment: '90000000-0000-4000-8000-000000000007',
  payout: '90000000-0000-4000-8000-000000000008',
  additionalCharge: '90000000-0000-4000-8000-000000000009',
  cancellation: '90000000-0000-4000-8000-000000000010',
  providerDayOff: '90000000-0000-4000-8000-000000000011',
  cleaningDocument: '90000000-0000-4000-8000-000000000012',
  plumbingDocument: '90000000-0000-4000-8000-000000000013',
};

const BOOKING_IDS = [
  IDS.pendingBooking,
  IDS.confirmedBooking,
  IDS.completedBooking,
  IDS.cancelledBooking,
];

function schema(name) {
  return supabase.schema(name);
}

function plusDays(days, hour = 10) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

function isoNow() {
  return new Date().toISOString();
}

async function must(label, promise) {
  const result = await promise;
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  return result.data;
}

async function maybe(label, promise) {
  const result = await promise;
  if (result.error) {
    console.warn(`[WARN] ${label}: ${result.error.message}`);
  }
  return result.data;
}

async function findAuthUserByEmail(email) {
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`List auth users: ${error.message}`);

    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

async function ensureAuthUser(email, fullName, role) {
  const existing = await findAuthUserByEmail(email);
  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      password: PASSWORD,
      user_metadata: { full_name: fullName, role },
      app_metadata: { role },
    });
    if (error) throw new Error(`Update auth user ${email}: ${error.message}`);
    return data.user.id;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName, role },
    app_metadata: { role },
  });
  if (error) throw new Error(`Create auth user ${email}: ${error.message}`);
  return data.user.id;
}

async function cleanup(sampleUserIds) {
  const bookingIdFilter = BOOKING_IDS.join(',');
  const providerIds = sampleUserIds.providers;
  const allUserIds = [
    sampleUserIds.admin,
    sampleUserIds.customer,
    sampleUserIds.cleaningProvider,
    sampleUserIds.plumbingProvider,
  ];

  await maybe('delete seeded notifications', schema('notification_and_support').from('notifications').delete().like('type', 'sample.%'));
  await maybe('delete seeded messages', schema('messages').from('messages').delete().eq('conversation_id', IDS.conversation));
  await maybe('delete seeded conversations', schema('messages').from('conversations').delete().eq('id', IDS.conversation));
  await maybe('delete seeded reports', schema('trust_and_reputation').from('provider_profile_reports').delete().eq('reason', 'sample_seed'));
  await maybe('delete seeded reviews', schema('trust_and_reputation').from('reviews').delete().in('booking_id', BOOKING_IDS));
  await maybe('delete seeded disputes', schema('notification_and_support').from('disputes').delete().in('booking_id', BOOKING_IDS));
  await maybe('delete seeded support tickets', schema('notification_and_support').from('support_tickets').delete().eq('ticket_id', IDS.supportTicket));
  await maybe('delete seeded payouts', schema('payment').from('provider_payouts').delete().like('reference', 'SEED-%'));
  await maybe('delete seeded payments', schema('payment').from('payments').delete().like('transaction_reference', 'SEED-%'));
  await maybe('delete seeded additional charges', schema('booking').from('additional_charges').delete().in('booking_id', BOOKING_IDS));
  await maybe('delete seeded cancellations', schema('booking').from('bookings_cancellations').delete().in('booking_id', BOOKING_IDS));
  await maybe('delete seeded attachments', schema('booking').from('booking_attachments').delete().in('booking_id', BOOKING_IDS));
  await maybe('delete seeded bookings', schema('booking').from('bookings').delete().filter('id', 'in', `(${bookingIdFilter})`));
  await maybe('delete seeded provider days off', schema('booking').from('provider_days_off').delete().eq('id', IDS.providerDayOff));
  if (providerIds.length > 0) {
    await maybe('delete seeded availability', schema('booking').from('provider_availability').delete().in('user_id', providerIds));
    await maybe('delete seeded provider documents', schema('provider_catalog').from('provider_documents').delete().in('provider_id', providerIds));
    await maybe('delete seeded provider services', schema('provider_catalog').from('provider_services').delete().in('provider_id', providerIds));
    await maybe('delete seeded provider profiles', schema('provider_catalog').from('provider_profiles').delete().in('user_id', providerIds));
  }
  await maybe('delete seeded address', schema('identity_and_user').from('user_addresses').delete().eq('id', IDS.address));
  await maybe('delete seeded customer profile', schema('identity_and_user').from('customer_profiles').delete().eq('user_id', sampleUserIds.customer));
  await maybe('delete seeded users by email', schema('identity_and_user').from('users').delete().in('email', SAMPLE_EMAILS));

  if (allUserIds.length === 0) return;
}

async function seed() {
  console.log('Creating/updating Supabase Auth test users...');
  const sampleUserIds = {
    admin: await ensureAuthUser('admin.sample@servease.test', 'Avery Admin', 'admin'),
    customer: await ensureAuthUser('customer.sample@servease.test', 'Mia Customer', 'customer'),
    cleaningProvider: await ensureAuthUser('provider.cleaning.sample@servease.test', 'Carlo Cleaner', 'provider'),
    plumbingProvider: await ensureAuthUser('provider.plumbing.sample@servease.test', 'Paula Plumber', 'provider'),
  };
  sampleUserIds.providers = [sampleUserIds.cleaningProvider, sampleUserIds.plumbingProvider];

  console.log('Removing prior sample-seed rows...');
  await cleanup(sampleUserIds);

  console.log('Seeding identity_and_user...');
  await must(
    'insert users',
    schema('identity_and_user').from('users').insert([
      {
        id: sampleUserIds.admin,
        email: 'admin.sample@servease.test',
        full_name: 'Avery Admin',
        contact_number: '+639170000001',
        role: 'admin',
        status: 'active',
        verification_status: 'verified',
        is_verified: true,
        email_verified_at: isoNow(),
      },
      {
        id: sampleUserIds.customer,
        email: 'customer.sample@servease.test',
        full_name: 'Mia Customer',
        contact_number: '+639170000002',
        role: 'customer',
        status: 'active',
        verification_status: 'verified',
        is_verified: true,
        email_verified_at: isoNow(),
      },
      {
        id: sampleUserIds.cleaningProvider,
        email: 'provider.cleaning.sample@servease.test',
        full_name: 'Carlo Cleaner',
        contact_number: '+639170000003',
        role: 'provider',
        status: 'active',
        verification_status: 'approved',
        is_verified: true,
        email_verified_at: isoNow(),
      },
      {
        id: sampleUserIds.plumbingProvider,
        email: 'provider.plumbing.sample@servease.test',
        full_name: 'Paula Plumber',
        contact_number: '+639170000004',
        role: 'provider',
        status: 'active',
        verification_status: 'approved',
        is_verified: true,
        email_verified_at: isoNow(),
      },
    ]),
  );
  await must(
    'insert customer profile',
    schema('identity_and_user').from('customer_profiles').insert({
      user_id: sampleUserIds.customer,
      date_of_birth: '1995-04-25',
      address: 'Unit 12, ServEase Residences',
      barangay: 'Kapitolyo',
      city: 'Pasig City',
      province: 'Metro Manila',
      region: 'National Capital Region',
      postal_code: '1603',
      landmark: 'Near Kapitolyo High Street',
    }),
  );
  await must(
    'insert address',
    schema('identity_and_user').from('user_addresses').insert({
      id: IDS.address,
      user_id: sampleUserIds.customer,
      label: 'Home',
      recipient_name: 'Mia Customer',
      contact_number: '+639170000002',
      address_line: 'Unit 12, ServEase Residences, 88 Demo Avenue',
      barangay: 'Kapitolyo',
      city: 'Pasig City',
      province: 'Metro Manila',
      region: 'National Capital Region',
      postal_code: '1603',
      landmark: 'Near Kapitolyo High Street',
      latitude: 14.5707,
      longitude: 121.0649,
      is_default: true,
    }),
  );

  console.log('Seeding provider_catalog...');
  await must(
    'upsert service categories',
    schema('provider_catalog').from('service_categories').upsert(
      [
        {
          id: IDS.cleaningCategory,
          name: 'Home Cleaning',
          slug: 'home-cleaning',
          icon_name: 'sparkles',
          display_order: 1,
          category_level: 'category',
          is_active: true,
        },
        {
          id: IDS.plumbingCategory,
          name: 'Plumbing',
          slug: 'plumbing',
          icon_name: 'wrench',
          display_order: 2,
          category_level: 'category',
          is_active: true,
        },
        {
          id: IDS.electricalCategory,
          name: 'Electrical',
          slug: 'electrical',
          icon_name: 'bolt',
          display_order: 3,
          category_level: 'category',
          is_active: true,
        },
      ],
      { onConflict: 'slug' },
    ),
  );
  await must(
    'upsert sample location',
    schema('provider_catalog').from('location').upsert(
      {
        id: IDS.location,
        name: 'Pasig City Demo Area',
        city: 'Pasig City',
        province: 'Metro Manila',
        region: 'National Capital Region',
        barangay: 'Kapitolyo',
        postal_code: '1603',
        latitude: 14.5707,
        longitude: 121.0649,
        is_active: true,
      },
      { onConflict: 'id' },
    ),
  );
  await must(
    'upsert PSGC sample province',
    schema('provider_catalog').from('psgc_provinces').upsert({ code: 'SEED-NCR', name: 'National Capital Region' }, { onConflict: 'code' }),
  );
  await must(
    'upsert PSGC sample city',
    schema('provider_catalog').from('psgc_cities').upsert({ code: 'SEED-PASIG', province_code: 'SEED-NCR', name: 'Pasig City' }, { onConflict: 'code' }),
  );
  await must(
    'upsert PSGC sample barangay',
    schema('provider_catalog').from('psgc_barangays').upsert({ code: 'SEED-KAPITOLYO', city_code: 'SEED-PASIG', name: 'Kapitolyo' }, { onConflict: 'code' }),
  );
  await must(
    'insert provider profiles',
    schema('provider_catalog').from('provider_profiles').insert([
      {
        user_id: sampleUserIds.cleaningProvider,
        business_name: 'Sparkle Home Cleaning',
        service_description: 'Residential cleaning, move-in deep cleans, and condo upkeep.',
        trust_score: 96,
        verification_status: 'approved',
        average_rating: 4.8,
        total_reviews: 28,
        years_experience: 6,
        service_radius_km: 12,
        is_available: true,
        date_of_birth: '1990-05-10',
      },
      {
        user_id: sampleUserIds.plumbingProvider,
        business_name: 'PipeFix Services',
        service_description: 'Leak repair, drain clearing, fixture installation, and emergency plumbing.',
        trust_score: 93,
        verification_status: 'approved',
        average_rating: 4.7,
        total_reviews: 19,
        years_experience: 8,
        service_radius_km: 15,
        is_available: true,
        date_of_birth: '1988-08-14',
      },
    ]),
  );
  await must(
    'insert provider documents',
    schema('provider_catalog').from('provider_documents').insert([
      {
        document_id: IDS.cleaningDocument,
        provider_id: sampleUserIds.cleaningProvider,
        document_type: 'government_id',
        document_file_path: 'sample-seed/provider-cleaning-government-id.pdf',
        status: 'approved',
        reviewed_at: isoNow(),
        reviewed_by: sampleUserIds.admin,
      },
      {
        document_id: IDS.plumbingDocument,
        provider_id: sampleUserIds.plumbingProvider,
        document_type: 'business_permit',
        document_file_path: 'sample-seed/provider-plumbing-business-permit.pdf',
        status: 'approved',
        reviewed_at: isoNow(),
        reviewed_by: sampleUserIds.admin,
      },
    ]),
  );
  await must(
    'insert provider services',
    schema('provider_catalog').from('provider_services').insert([
      {
        id: IDS.cleaningService,
        provider_id: sampleUserIds.cleaningProvider,
        service_id: IDS.cleaningCategory,
        title: 'Condo Deep Cleaning',
        description: 'A two-hour deep clean for a studio or one-bedroom condo.',
        pricing_mode: 'flat',
        price: 1800,
        duration_minutes: 120,
        is_active: true,
      },
      {
        id: IDS.plumbingService,
        provider_id: sampleUserIds.plumbingProvider,
        service_id: IDS.plumbingCategory,
        title: 'Leak Repair Visit',
        description: 'Leak diagnosis and repair for sinks, toilets, and exposed pipes.',
        pricing_mode: 'flat',
        price: 2200,
        duration_minutes: 120,
        is_active: true,
      },
    ]),
  );

  console.log('Seeding booking...');
  await must(
    'insert availability',
    schema('booking').from('provider_availability').insert([
      { user_id: sampleUserIds.cleaningProvider, day_of_week: 'Monday', start_time: '08:00', end_time: '17:00', break_start_time: '12:00', break_end_time: '13:00', is_active: true },
      { user_id: sampleUserIds.cleaningProvider, day_of_week: 'Tuesday', start_time: '08:00', end_time: '17:00', break_start_time: '12:00', break_end_time: '13:00', is_active: true },
      { user_id: sampleUserIds.cleaningProvider, day_of_week: 'Wednesday', start_time: '08:00', end_time: '17:00', break_start_time: '12:00', break_end_time: '13:00', is_active: true },
      { user_id: sampleUserIds.plumbingProvider, day_of_week: 'Monday', start_time: '09:00', end_time: '18:00', break_start_time: '12:00', break_end_time: '13:00', is_active: true },
      { user_id: sampleUserIds.plumbingProvider, day_of_week: 'Thursday', start_time: '09:00', end_time: '18:00', break_start_time: '12:00', break_end_time: '13:00', is_active: true },
      { user_id: sampleUserIds.plumbingProvider, day_of_week: 'Friday', start_time: '09:00', end_time: '18:00', break_start_time: '12:00', break_end_time: '13:00', is_active: true },
    ]),
  );
  await must(
    'insert provider day off',
    schema('booking').from('provider_days_off').insert({
      id: IDS.providerDayOff,
      user_id: sampleUserIds.plumbingProvider,
      off_date: plusDays(14).slice(0, 10),
      reason: 'Sample seed day off',
    }),
  );
  await must(
    'insert bookings',
    schema('booking').from('bookings').insert([
      {
        id: IDS.pendingBooking,
        booking_reference: 'SEED-PENDING-001',
        customer_id: sampleUserIds.customer,
        provider_id: sampleUserIds.cleaningProvider,
        service_id: IDS.cleaningService,
        service_title: 'Condo Deep Cleaning',
        service_name: 'Condo Deep Cleaning',
        service_description: 'Sample pending cleaning request.',
        service_location_type: 'mobile',
        service_address: 'Unit 12, ServEase Residences, Pasig City',
        scheduled_at: plusDays(2, 9),
        hours_required: 2,
        status: 'pending',
        payment_method: 'cash_on_service',
        service_amount: 1800,
        additional_amount: 0,
        total_amount: 1800,
        customer_notes: 'Please bring eco-friendly cleaning supplies.',
      },
      {
        id: IDS.confirmedBooking,
        booking_reference: 'SEED-CONFIRMED-001',
        customer_id: sampleUserIds.customer,
        provider_id: sampleUserIds.plumbingProvider,
        service_id: IDS.plumbingService,
        service_title: 'Leak Repair Visit',
        service_name: 'Leak Repair Visit',
        service_description: 'Sample confirmed plumbing request.',
        service_location_type: 'mobile',
        service_address: 'Unit 12, ServEase Residences, Pasig City',
        scheduled_at: plusDays(3, 10),
        hours_required: 2,
        status: 'confirmed',
        payment_method: 'cash_on_service',
        service_amount: 2200,
        additional_amount: 0,
        total_amount: 2200,
        provider_notes: 'Confirmed, arriving within the selected window.',
      },
      {
        id: IDS.completedBooking,
        booking_reference: 'SEED-COMPLETED-001',
        customer_id: sampleUserIds.customer,
        provider_id: sampleUserIds.cleaningProvider,
        service_id: IDS.cleaningService,
        service_title: 'Condo Deep Cleaning',
        service_name: 'Condo Deep Cleaning',
        service_description: 'Sample completed cleaning booking.',
        service_location_type: 'mobile',
        service_address: 'Unit 12, ServEase Residences, Pasig City',
        scheduled_at: plusDays(-2, 8),
        hours_required: 2,
        status: 'completed',
        payment_method: 'cash_on_service',
        service_amount: 1800,
        additional_amount: 250,
        total_amount: 2050,
        started_at: plusDays(-2, 8),
        completed_at: plusDays(-2, 11),
      },
      {
        id: IDS.cancelledBooking,
        booking_reference: 'SEED-CANCELLED-001',
        customer_id: sampleUserIds.customer,
        provider_id: sampleUserIds.plumbingProvider,
        service_id: IDS.plumbingService,
        service_title: 'Leak Repair Visit',
        service_name: 'Leak Repair Visit',
        service_description: 'Sample cancelled plumbing request.',
        service_location_type: 'mobile',
        service_address: 'Unit 12, ServEase Residences, Pasig City',
        scheduled_at: plusDays(5, 15),
        hours_required: 2,
        status: 'cancelled',
        payment_method: 'cash_on_service',
        service_amount: 2200,
        additional_amount: 0,
        total_amount: 2200,
        cancelled_by: sampleUserIds.customer,
        cancel_reason: 'schedule_conflict',
        cancel_explanation: 'Sample cancellation for admin testing.',
        cancelled_at: isoNow(),
      },
    ]),
  );
  await must(
    'insert additional charge',
    schema('booking').from('additional_charges').insert({
      id: IDS.additionalCharge,
      booking_id: IDS.completedBooking,
      requested_by: sampleUserIds.cleaningProvider,
      description: 'Extra bathroom deep clean',
      amount: 250,
      justification: 'Customer approved one extra bathroom cleaning.',
      status: 'approved',
      reviewed_at: isoNow(),
      reviewed_by: sampleUserIds.customer,
    }),
  );
  await must(
    'insert cancellation audit',
    schema('booking').from('bookings_cancellations').insert({
      id: IDS.cancellation,
      booking_id: IDS.cancelledBooking,
      user_id: sampleUserIds.customer,
      reason: 'schedule_conflict',
      explanation: 'Sample cancellation for admin testing.',
    }),
  );

  console.log('Seeding payment...');
  await must(
    'insert payments',
    schema('payment').from('payments').insert([
      {
        id: IDS.payment,
        booking_id: IDS.completedBooking,
        customer_id: sampleUserIds.customer,
        provider_id: sampleUserIds.cleaningProvider,
        amount: 2050,
        currency: 'PHP',
        method: 'cash_on_service',
        status: 'completed',
        transaction_reference: 'SEED-PAYMENT-001',
        paid_at: plusDays(-2, 11),
      },
    ]),
  );
  await must(
    'insert payout',
    schema('payment').from('provider_payouts').insert({
      id: IDS.payout,
      provider_id: sampleUserIds.cleaningProvider,
      period_start: plusDays(-7).slice(0, 10),
      period_end: plusDays(-1).slice(0, 10),
      gross_amount: 2050,
      platform_fee: 205,
      net_amount: 1845,
      status: 'pending',
      reference: 'SEED-PAYOUT-001',
    }),
  );

  console.log('Seeding support, trust, and messages...');
  await must(
    'insert support ticket',
    schema('notification_and_support').from('support_tickets').insert({
      ticket_id: IDS.supportTicket,
      user_id: sampleUserIds.customer,
      subject: 'Sample: Need help with a booking',
      message: 'This sample ticket is available for admin support testing.',
      status: 'open',
      priority: 'normal',
      assigned_to: sampleUserIds.admin,
    }),
  );
  await must(
    'insert dispute',
    schema('notification_and_support').from('disputes').insert({
      id: IDS.dispute,
      booking_id: IDS.completedBooking,
      customer_id: sampleUserIds.customer,
      provider_id: sampleUserIds.cleaningProvider,
      reason: 'Sample dispute',
      description: 'Demo dispute for admin operations testing.',
      status: 'under_review',
    }),
  );
  await must(
    'insert review',
    schema('trust_and_reputation').from('reviews').insert({
      id: IDS.review,
      booking_id: IDS.completedBooking,
      reviewer_id: sampleUserIds.customer,
      reviewee_id: sampleUserIds.cleaningProvider,
      rating: 5,
      review_text: 'Sample review: fast, professional, and thorough.',
    }),
  );
  await must(
    'insert report',
    schema('trust_and_reputation').from('provider_profile_reports').insert({
      id: IDS.report,
      booking_id: IDS.completedBooking,
      reporter_id: sampleUserIds.customer,
      provider_id: sampleUserIds.cleaningProvider,
      reason: 'sample_seed',
      details: 'Sample report row for trust and reputation admin review.',
      status: 'open',
    }),
  );
  await must(
    'insert conversation',
    schema('messages').from('conversations').insert({
      id: IDS.conversation,
      context_type: 'booking',
      context_id: IDS.confirmedBooking,
      status: 'active',
      last_message_at: isoNow(),
    }),
  );
  await must(
    'insert messages',
    schema('messages').from('messages').insert([
      {
        conversation_id: IDS.conversation,
        sender_id: sampleUserIds.customer,
        message_type: 'text',
        body: 'Hi, can you check the sink leak under the cabinet?',
        delivery_status: 'read',
      },
      {
        conversation_id: IDS.conversation,
        sender_id: sampleUserIds.plumbingProvider,
        message_type: 'text',
        body: 'Yes, I will bring replacement fittings just in case.',
        delivery_status: 'delivered',
      },
    ]),
  );
  await must(
    'insert notifications',
    schema('notification_and_support').from('notifications').insert([
      {
        user_id: sampleUserIds.admin,
        actor_id: sampleUserIds.customer,
        booking_id: IDS.pendingBooking,
        type: 'sample.admin.provider-review',
        title: 'Sample data ready',
        body: 'Sample bookings, providers, payments, support tickets, and reviews have been seeded.',
        data: { seed: 'sample-data' },
      },
      {
        user_id: sampleUserIds.customer,
        actor_id: sampleUserIds.cleaningProvider,
        booking_id: IDS.confirmedBooking,
        type: 'sample.booking.confirmed',
        title: 'Booking confirmed',
        body: 'PipeFix Services confirmed your sample booking.',
        data: { booking_reference: 'SEED-CONFIRMED-001' },
      },
      {
        user_id: sampleUserIds.cleaningProvider,
        actor_id: sampleUserIds.customer,
        booking_id: IDS.pendingBooking,
        type: 'sample.booking.requested',
        title: 'New sample booking request',
        body: 'Mia Customer requested Condo Deep Cleaning.',
        data: { booking_reference: 'SEED-PENDING-001' },
      },
    ]),
  );

  console.log('\nSeed complete.');
  console.log(JSON.stringify(
    {
      password: PASSWORD,
      accounts: {
        admin: 'admin.sample@servease.test',
        customer: 'customer.sample@servease.test',
        cleaningProvider: 'provider.cleaning.sample@servease.test',
        plumbingProvider: 'provider.plumbing.sample@servease.test',
      },
      bookingReferences: [
        'SEED-PENDING-001',
        'SEED-CONFIRMED-001',
        'SEED-COMPLETED-001',
        'SEED-CANCELLED-001',
      ],
    },
    null,
    2,
  ));
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
