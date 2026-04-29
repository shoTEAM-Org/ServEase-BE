import { Global, Module } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

function toTrimmedString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return '';
}

function toEnvPrefix(serviceName: string): string {
  return serviceName.replaceAll(/[^A-Za-z0-9]+/g, '_').toUpperCase();
}

function toBoolean(value: unknown): boolean {
  const normalized = toTrimmedString(value).toLowerCase();
  return (
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 'yes' ||
    normalized === 'on'
  );
}

function toServiceScopedEnvName(
  baseVarName: string,
  serviceName: string,
): string {
  return `${toEnvPrefix(serviceName)}_${baseVarName}`;
}

function resolveServiceScopedEnv(
  baseVarName: string,
  serviceName: string,
): string {
  const normalizedServiceName = toTrimmedString(serviceName);
  if (!normalizedServiceName) return '';

  const scopedName = toServiceScopedEnvName(baseVarName, normalizedServiceName);
  const scopedValue = toTrimmedString(process.env[scopedName]);
  if (scopedValue) return scopedValue;

  return '';
}

@Global()
@Module({
  providers: [
    {
      provide: SupabaseClient,
      useFactory: () => {
        const serviceName = toTrimmedString(process.env.SERVICE_NAME);
        const strictServiceScope = toBoolean(
          process.env.SUPABASE_STRICT_SERVICE_SCOPE,
        );

        const scopedSupabaseUrl = resolveServiceScopedEnv(
          'SUPABASE_URL',
          serviceName,
        );
        const scopedSupabaseKey = resolveServiceScopedEnv(
          'SUPABASE_SECRET_KEY',
          serviceName,
        );

        if (
          strictServiceScope &&
          serviceName &&
          (!scopedSupabaseUrl || !scopedSupabaseKey)
        ) {
          const expectedUrlVar = toServiceScopedEnvName(
            'SUPABASE_URL',
            serviceName,
          );
          const expectedKeyVar = toServiceScopedEnvName(
            'SUPABASE_SECRET_KEY',
            serviceName,
          );
          throw new Error(
            `Strict service-scoped Supabase mode is enabled. Missing ${expectedUrlVar} and/or ${expectedKeyVar}.`,
          );
        }

        const supabaseUrl =
          scopedSupabaseUrl || toTrimmedString(process.env.SUPABASE_URL);
        const supabaseKey =
          scopedSupabaseKey || toTrimmedString(process.env.SUPABASE_SECRET_KEY);

        if (!supabaseUrl || !supabaseKey) {
          throw new Error(
            `Supabase URL and Key are missing from environment variables${
              serviceName ? ` for service ${serviceName}` : ''
            }.`,
          );
        }

        return createClient(supabaseUrl, supabaseKey);
      },
    },
  ],
  exports: [SupabaseClient],
})
export class SupabaseModule {}
