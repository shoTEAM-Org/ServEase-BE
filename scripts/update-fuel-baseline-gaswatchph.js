#!/usr/bin/env node
/**
 * Fetch GasWatchPH public page averages and cache them for pricing quotes.
 *
 * This is intentionally an operational cache warmer. Booking quotes should read
 * from booking.fuel_price_cache, not depend on GasWatchPH at request time.
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const GASWATCH_URL = 'https://gaswatchph.com/';

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
  npm run fuel:gaswatchph
  npm run fuel:gaswatchph -- --url https://gaswatchph.com/
  npm run fuel:gaswatchph -- --dry-run

Options:
  --url <url>      Override GasWatchPH URL
  --dry-run        Parse and print values without inserting rows
`);
}

function decodeHtml(value) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8369;|&peso;/g, '₱')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(value) {
  return decodeHtml(value.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' '));
}

function parseGasWatchAverages(html) {
  const text = stripHtml(html).replace(/\s+/g, ' ').trim();
  let summaryMatch = text.match(
    /Metro Manila averages are ₱\s*([0-9]+(?:\.[0-9]{1,2})?)\/L for diesel and unleaded is ₱\s*([0-9]+(?:\.[0-9]{1,2})?)\/L/i,
  );
  if (!summaryMatch) {
    summaryMatch = text.match(
      /average diesel price is ₱\s*([0-9]+(?:\.[0-9]{1,2})?)\/L and unleaded is ₱\s*([0-9]+(?:\.[0-9]{1,2})?)\/L/i,
    );
  }
  if (!summaryMatch) {
    summaryMatch = text.match(
      /Metro Manila average diesel price is ₱\s*([0-9]+(?:\.[0-9]{1,2})?)\/L and unleaded is ₱\s*([0-9]+(?:\.[0-9]{1,2})?)\/L/i,
    );
  }
  const diesel = summaryMatch?.[1] ? Math.round(Number(summaryMatch[1]) * 100) / 100 : null;
  const gasoline = summaryMatch?.[2] ? Math.round(Number(summaryMatch[2]) * 100) / 100 : null;
  const weekMatch = text.match(/week of ([A-Za-z]{3,9}\s+\d{1,2}\s*[–-]\s*[A-Za-z]{0,9}\s*\d{1,2},\s*\d{4})/i);

  return {
    diesel,
    gasoline,
    weekLabel: weekMatch?.[1] || null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printHelp();
    return;
  }

  const url = String(args.url || GASWATCH_URL);
  const response = await fetch(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'ServEase fuel baseline updater (+https://servease.local)',
    },
  });
  if (!response.ok) throw new Error(`GasWatchPH fetch failed with HTTP ${response.status}.`);

  const html = await response.text();
  const parsed = parseGasWatchAverages(html);
  if (!parsed.diesel && !parsed.gasoline) {
    throw new Error('Could not parse diesel or unleaded averages from GasWatchPH.');
  }

  const now = new Date();
  const validUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const rows = [
    parsed.gasoline
      ? {
          country_code: 'PH',
          fuel_type: 'gasoline',
          price_per_liter: parsed.gasoline,
          currency: 'PHP',
          source_name: 'GasWatch PH / DOE weekly advisory',
          source_url: url,
          fetched_at: now.toISOString(),
          valid_until: validUntil.toISOString(),
          raw_payload: { source: 'gaswatchph-page', week_label: parsed.weekLabel },
        }
      : null,
    parsed.diesel
      ? {
          country_code: 'PH',
          fuel_type: 'diesel',
          price_per_liter: parsed.diesel,
          currency: 'PHP',
          source_name: 'GasWatch PH / DOE weekly advisory',
          source_url: url,
          fetched_at: now.toISOString(),
          valid_until: validUntil.toISOString(),
          raw_payload: { source: 'gaswatchph-page', week_label: parsed.weekLabel },
        }
      : null,
  ].filter(Boolean);

  if (args['dry-run']) {
    console.log(JSON.stringify({ parsed, rows }, null, 2));
    return;
  }

  const env = readEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in ServEase-BE/.env.');
  }
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .schema('booking')
    .from('fuel_price_cache')
    .insert(rows)
    .select('fuel_type, price_per_liter, source_name, source_url, fetched_at, valid_until');
  if (error) throw new Error(error.message);

  console.log(JSON.stringify({ inserted: data, parsed }, null, 2));
}

main().catch((error) => {
  console.error(`[fuel:gaswatchph] ${error.message}`);
  process.exit(1);
});

module.exports = { parseGasWatchAverages };
