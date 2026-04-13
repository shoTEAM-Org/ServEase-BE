import { Controller, Get, Inject, OnModuleInit } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { CATALOG_PATTERNS } from '@app/common';

@Controller('api/reference')
export class ReferenceController implements OnModuleInit {
  constructor(@Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka) {}

  async onModuleInit() {
    this.kafka.subscribeToResponseOf(CATALOG_PATTERNS.GET_REFERENCE_CATEGORIES);
    await this.kafka.connect();
  }

  @Get('v1/categories')
  async getCategories() { return lastValueFrom(this.kafka.send(CATALOG_PATTERNS.GET_REFERENCE_CATEGORIES, {})); }
}
