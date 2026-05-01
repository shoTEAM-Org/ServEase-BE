#!/usr/bin/env node
/**
 * Insert a weekly DOE-based fuel baseline into booking.fuel_price_cache.
 *
 * Usage:
 *   npm run fuel:baseline -- --gasoline 64.50 --diesel 58.20
 *   npm run fuel:baseline -- --gasoline 64.50 --diesel 58.20 --source-url https://...
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function readEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  const fileEnv = fs.existsSync(envPath)
    ? Object.fromEntries(
        fs
          .readFileSync(envPath, 'utf8')
          .split(/\r?\n/)
          .filter((line) => line && !line.trimStart().startsWith('#') && line.includes('='))
          .map((line) => {
            const index = line.indexOf('=');
            return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
          }),
      )
    : {};
  return { ...fileEnv, ...process.env };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  npm run fuel:baseline -- --gasoline 64.50 --diesel 58.20
  npm run fuel:baseline -- --gasoline 64.50 --diesel 58.20 --source-url https://staging.doe.gov.ph/site/oimb

Options:
  --gasoline <PHP/L>     Gasoline baseline in PHP per liter
  --diesel <PHP/L>       Diesel baseline in PHP per liter
  --source-name <name>   Source label, defaults to DOE OIMB weekly fuel advisory
  --source-url <url>     Source URL for traceability
  --fetched-at <date>    Advisory timestamp, defaults to now
`);
}

function positivePrice(value, label) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return Math.round(parsed * 100) / 100;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printHelp();
    return;
  }
  const gasoline = positivePrice(args.gasoline, '--gasoline');
  const diesel = positivePrice(args.diesel, '--diesel');
  if (!gasoline && !diesel) {
    throw new Error('Provide at least one price: --gasoline <PHP/L> or --diesel <PHP/L>.');
  }

  const env = readEnv();
  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in ServEase-BE/.env.');
  }

  const now = args['fetched-at'] ? new Date(String(args['fetched-at'])) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error('--fetched-at must be a valid date.');
  const validUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const sourceName = String(args['source-name'] || 'DOE OIMB weekly fuel advisory');
  const sourceUrl = args['source-url'] ? String(args['source-url']) : null;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const rows = [
    gasoline
      ? {
          country_code: 'PH',
          fuel_type: 'gasoline',
          price_per_liter: gasoline,
          currency: 'PHP',
          source_name: sourceName,
          source_url: sourceUrl,
          fetched_at: now.toISOString(),
          valid_until: validUntil.toISOString(),
          raw_payload: { source: 'manual-doe-baseline', args },
        }
      : null,
    diesel
      ? {
          country_code: 'PH',
          fuel_type: 'diesel',
          price_per_liter: diesel,
          currency: 'PHP',
          source_name: sourceName,
          source_url: sourceUrl,
          fetched_at: now.toISOString(),
          valid_until: validUntil.toISOString(),
          raw_payload: { source: 'manual-doe-baseline', args },
        }
      : null,
  ].filter(Boolean);

  const { data, error } = await supabase
    .schema('booking')
    .from('fuel_price_cache')
    .insert(rows)
    .select('fuel_type, price_per_liter, source_name, fetched_at, valid_until');
  if (error) throw new Error(error.message);

  console.log(JSON.stringify({ inserted: data }, null, 2));
}

main().catch((error) => {
  console.error(`[fuel:baseline] ${error.message}`);
  process.exit(1);
});
