import { Controller, Get, Param, Inject, OnModuleInit } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { sendWithTimeout } from '../utils/kafka-request.js';
import { CATALOG_PATTERNS } from '@app/common';

@Controller('api/locations')
export class LocationsController implements OnModuleInit {
  constructor(@Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka) {}

  async onModuleInit() {
    [
      CATALOG_PATTERNS.GET_LOCATIONS,
      CATALOG_PATTERNS.GET_PROVINCES,
      CATALOG_PATTERNS.GET_CITIES,
      CATALOG_PATTERNS.GET_BARANGAYS,
    ].forEach((p) => this.kafka.subscribeToResponseOf(p));
    await this.kafka.connect();
  }

  @Get('v1')
  async getLocations() {
    return sendWithTimeout(this.kafka.send(CATALOG_PATTERNS.GET_LOCATIONS, {}));
  }

  @Get('v1/provinces')
  async getProvinces() {
    return sendWithTimeout(this.kafka.send(CATALOG_PATTERNS.GET_PROVINCES, {}));
  }

  @Get('v1/provinces/:provinceCode/cities')
  async getCities(@Param('provinceCode') provinceCode: string) {
    return sendWithTimeout(
      this.kafka.send(CATALOG_PATTERNS.GET_CITIES, { provinceCode }),
    );
  }

  @Get('v1/cities/:cityCode/barangays')
  async getBarangays(@Param('cityCode') cityCode: string) {
    return sendWithTimeout(
      this.kafka.send(CATALOG_PATTERNS.GET_BARANGAYS, { cityCode }),
    );
  }
}
