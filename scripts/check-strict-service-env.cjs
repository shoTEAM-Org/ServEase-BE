const SERVICE_NAMES = [
  'gateway',
  'auth-service',
  'booking-service',
  'catalog-service',
  'chat-service',
  'customer-service',
  'notifications-service',
  'payment-service',
  'provider-service',
  'support-service',
  'trust-service',
  'admin-service',
];

function toTrimmedString(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return '';
}

function toBoolean(value) {
  const normalized = toTrimmedString(value).toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function toEnvPrefix(serviceName) {
  return serviceName.replaceAll(/[^A-Za-z0-9]+/g, '_').toUpperCase();
}

function checkStrictServiceEnv() {
  const strictMode = toBoolean(process.env.SUPABASE_STRICT_SERVICE_SCOPE);
  if (!strictMode) {
    console.log('Strict service-scoped Supabase mode disabled; skipping scoped env validation.');
    return 0;
  }

  const missing = [];
  for (const serviceName of SERVICE_NAMES) {
    const prefix = toEnvPrefix(serviceName);
    const urlVar = `${prefix}_SUPABASE_URL`;
    const keyVar = `${prefix}_SUPABASE_SECRET_KEY`;

    const urlValue = toTrimmedString(process.env[urlVar]);
    const keyValue = toTrimmedString(process.env[keyVar]);

    if (!urlValue || !keyValue) {
      missing.push({ serviceName, urlVar, keyVar });
    }
  }

  if (!missing.length) {
    console.log('Strict service-scoped Supabase env check passed for all services.');
    return 0;
  }

  console.error('Strict service-scoped Supabase env check failed. Missing variables:');
  for (const item of missing) {
    console.error(`- ${item.serviceName}: ${item.urlVar} and/or ${item.keyVar}`);
  }

  return 1;
}

const exitCode = checkStrictServiceEnv();
process.exit(exitCode);
