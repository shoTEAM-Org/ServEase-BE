import { Controller, Get, Query, Inject, OnModuleInit } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { CATALOG_PATTERNS } from '@app/common';

@Controller('api/services')
export class ServicesController implements OnModuleInit {
  constructor(@Inject('CATALOG_SERVICE') private readonly catalogClient: ClientKafka) {}

  async onModuleInit() {
    this.catalogClient.subscribeToResponseOf(CATALOG_PATTERNS.GET_ALL_SERVICES);
    this.catalogClient.subscribeToResponseOf(CATALOG_PATTERNS.SEARCH_SERVICES);
    await this.catalogClient.connect();
  }

  @Get('v1')
  async getAllServices() {
    return lastValueFrom(this.catalogClient.send(CATALOG_PATTERNS.GET_ALL_SERVICES, {}));
  }

  @Get('v2/search')
  async search(@Query('keyword') keyword: string) {
    return lastValueFrom(this.catalogClient.send(CATALOG_PATTERNS.SEARCH_SERVICES, { keyword }));
  }
}
