import { Module } from '@nestjs/common';
import { TribeClient } from '@implementsprint/sdk';

@Module({
  providers: [
    {
      provide: TribeClient,
      useFactory: () =>
        new TribeClient({
          gatewayUrl: process.env.TRIBE_GATEWAY_URL ?? '',
          tribeId: process.env.TRIBE_ID ?? '',
          secret: process.env.TRIBE_SECRET ?? '',
        }),
    },
  ],
  exports: [TribeClient],
})
export class TribeClientModule {}
