import { Controller, Get, Inject, OnModuleInit } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { CATALOG_PATTERNS } from '@app/common';

@Controller('api/reference')
export class ReferenceController implements OnModuleInit {
  constructor(@Inject('CATALOG_SERVICE') private readonly catalogClient: ClientKafka) {}

  async onModuleInit() {
    this.catalogClient.subscribeToResponseOf(CATALOG_PATTERNS.GET_CATEGORIES);
    await this.catalogClient.connect();
  }

  @Get('v1/categories')
  async getCategories() {
    return lastValueFrom(this.catalogClient.send(CATALOG_PATTERNS.GET_CATEGORIES, {}));
  }
}
