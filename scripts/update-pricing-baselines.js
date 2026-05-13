#!/usr/bin/env node
/**
 * Upsert category labor baselines used by the advisory pricing engine.
 *
 * Usage:
 *   npm run pricing:baselines -- --file scripts/pricing-baselines.example.json
 *   npm run pricing:baselines -- --file scripts/pricing-baselines.example.json --dry-run
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
  npm run pricing:baselines -- --file scripts/pricing-baselines.example.json
  npm run pricing:baselines -- --file scripts/pricing-baselines.example.json --dry-run

Each JSON item needs:
  slug or serviceId
  pricingMode: flat | hourly
  minLaborAmount
  maxLaborAmount
  typicalLaborAmount
  sourceNote
`);
}

function money(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return Math.round(parsed * 100) / 100;
}

function validateItem(item, index) {
  const label = `baseline[${index}]`;
  const slug = typeof item.slug === 'string' ? item.slug.trim() : '';
  const serviceId = typeof item.serviceId === 'string' ? item.serviceId.trim() : '';
  if (!slug && !serviceId) throw new Error(`${label} needs slug or serviceId.`);
  const pricingMode = String(item.pricingMode || item.pricing_mode || '').trim().toLowerCase();
  if (!['flat', 'hourly'].includes(pricingMode)) {
    throw new Error(`${label}.pricingMode must be flat or hourly.`);
  }
  const minLaborAmount = money(item.minLaborAmount ?? item.min_labor_amount, `${label}.minLaborAmount`);
  const maxLaborAmount = money(item.maxLaborAmount ?? item.max_labor_amount, `${label}.maxLaborAmount`);
  const typicalLaborAmount = money(
    item.typicalLaborAmount ?? item.typical_labor_amount,
    `${label}.typicalLaborAmount`,
  );
  if (maxLaborAmount < minLaborAmount) throw new Error(`${label}.maxLaborAmount must be >= minLaborAmount.`);
  if (typicalLaborAmount < minLaborAmount || typicalLaborAmount > maxLaborAmount) {
    throw new Error(`${label}.typicalLaborAmount must be within min/max.`);
  }
  return {
    slug,
    serviceId,
    pricingMode,
    minLaborAmount,
    maxLaborAmount,
    typicalLaborAmount,
    sourceNote: String(item.sourceNote || item.source_note || 'ServEase category baseline').trim(),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printHelp();
    return;
  }
  const file = String(args.file || '').trim();
  if (!file) throw new Error('Missing --file <baseline.json>.');
  const filePath = path.resolve(process.cwd(), file);
  const baselines = JSON.parse(fs.readFileSync(filePath, 'utf8')).map(validateItem);

  const env = readEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in ServEase-BE/.env.');
  }
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const slugs = baselines.map((item) => item.slug).filter(Boolean);
  const { data: categories, error: categoryError } = await supabase
    .schema('provider_catalog')
    .from('service_categories')
    .select('id, slug, name')
    .in('slug', slugs.length ? slugs : ['__none__']);
  if (categoryError) throw new Error(categoryError.message);
  const categoryBySlug = new Map((categories || []).map((row) => [row.slug, row]));

  const rows = baselines.map((item) => {
    const category = item.slug ? categoryBySlug.get(item.slug) : null;
    const serviceId = item.serviceId || category?.id;
    if (!serviceId) throw new Error(`No service category found for slug "${item.slug}".`);
    return {
      service_id: serviceId,
      pricing_mode: item.pricingMode,
      min_labor_amount: item.minLaborAmount,
      max_labor_amount: item.maxLaborAmount,
      typical_labor_amount: item.typicalLaborAmount,
      source_note: item.sourceNote,
      is_active: true,
    };
  });

  if (args['dry-run']) {
    console.log(JSON.stringify({ rows }, null, 2));
    return;
  }

  const { data, error } = await supabase
    .schema('provider_catalog')
    .from('service_pricing_baselines')
    .upsert(rows, { onConflict: 'service_id' })
    .select('service_id, pricing_mode, min_labor_amount, max_labor_amount, typical_labor_amount, source_note');
  if (error) throw new Error(error.message);
  console.log(JSON.stringify({ upserted: data }, null, 2));
}

main().catch((error) => {
  console.error(`[pricing:baselines] ${error.message}`);
  process.exit(1);
});
