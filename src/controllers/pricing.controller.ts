import { Body, Controller, Post } from '@nestjs/common';
import { PricingEngine } from '@app/common';

@Controller('api/pricing')
export class PricingController {
  @Post('v1/quote')
  quote(@Body() body: any) {
    return { pricing: PricingEngine.quote(body || {}) };
  }
}
