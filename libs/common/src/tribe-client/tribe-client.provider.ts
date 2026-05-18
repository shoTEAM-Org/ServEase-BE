import { TribeClient } from '@implementsprint/sdk';

export const TRIBE_CLIENT = 'TRIBE_CLIENT';

export const TribeClientProvider = {
  provide: TRIBE_CLIENT,
  useFactory: async (): Promise<TribeClient> => {
    const client = new TribeClient({
      gatewayUrl: process.env.APICENTER_URL || 'http://localhost:3000',
      tribeId: process.env.APICENTER_TRIBE_ID || 'auth-service',
      secret: process.env.APICENTER_TRIBE_SECRET || '',
    });
    await client.authenticate();
    return client;
  },
};
