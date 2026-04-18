import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get('live')
  live() {
    return {
      status: 'ok',
      service: 'gateway',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  ready() {
    return {
      status: 'ready',
      service: 'gateway',
      kafkaBroker: process.env.KAFKA_BROKER || 'localhost:9092',
      timestamp: new Date().toISOString(),
    };
  }
}
