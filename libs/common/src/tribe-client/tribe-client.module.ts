import { Module } from '@nestjs/common';
import { TribeClientProvider, TRIBE_CLIENT } from './tribe-client.provider.js';

@Module({
  providers: [TribeClientProvider],
  exports: [TRIBE_CLIENT],
})
export class TribeClientModule {}
