import { Controller, Get, Inject, OnModuleInit } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { CATALOG_PATTERNS } from '@app/common';

@Controller('api/locations')
export class LocationsController implements OnModuleInit {
  constructor(@Inject('CATALOG_SERVICE') private readonly catalogClient: ClientKafka) {}

  async onModuleInit() {
    this.catalogClient.subscribeToResponseOf(CATALOG_PATTERNS.GET_LOCATIONS);
    await this.catalogClient.connect();
  }

  @Get('v1')
  async getLocations() {
    return lastValueFrom(this.catalogClient.send(CATALOG_PATTERNS.GET_LOCATIONS, {}));
  }
}
