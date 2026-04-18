const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const APPS_DIR = path.join(ROOT_DIR, 'apps');

const SERVICE_SCHEMA_OWNERSHIP = {
  'admin-service': [],
  'auth-service': ['identity_and_user'],
  'booking-service': ['booking'],
  'catalog-service': ['provider_catalog'],
  'chat-service': ['messages'],
  'customer-service': ['identity_and_user', 'identity_svc'],
  'notifications-service': ['notification_and_support'],
  'payment-service': ['payment'],
  'provider-service': ['provider_catalog'],
  'support-service': ['notification_and_support'],
  'trust-service': ['trust_and_reputation', 'trust_svc'],
};

function collectTypeScriptFiles(dirPath) {
  const results = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;

    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTypeScriptFiles(fullPath));
      continue;
    }

    if (entry.isFile() && fullPath.endsWith('.ts')) {
      results.push(fullPath);
    }
  }

  return results;
}

function getServiceName(filePath) {
  const relative = path.relative(APPS_DIR, filePath);
  const [serviceName] = relative.split(path.sep);
  return serviceName;
}

function checkSchemaOwnership() {
  const tsFiles = collectTypeScriptFiles(APPS_DIR);
  const violations = [];

  for (const filePath of tsFiles) {
    const serviceName = getServiceName(filePath);
    const allowedSchemas = SERVICE_SCHEMA_OWNERSHIP[serviceName] || [];
    const fileContent = fs.readFileSync(filePath, 'utf8');

    const schemaRegex = /\.schema\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
    let match = schemaRegex.exec(fileContent);
    while (match) {
      const schemaName = String(match[1] || '').trim();
      if (!allowedSchemas.includes(schemaName)) {
        const relativePath = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
        violations.push({
          serviceName,
          schemaName,
          relativePath,
        });
      }
      match = schemaRegex.exec(fileContent);
    }
  }

  if (!violations.length) {
    console.log('Schema boundary check passed: all schema() usages match service ownership.');
    return 0;
  }

  console.error('Schema boundary check failed. Violations found:');
  for (const violation of violations) {
    console.error(
      `- ${violation.relativePath}: service ${violation.serviceName} uses schema ${violation.schemaName}`,
    );
  }
  return 1;
}

const exitCode = checkSchemaOwnership();
process.exit(exitCode);
