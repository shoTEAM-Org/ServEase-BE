import { Controller, Get, Param, Query, Inject, OnModuleInit } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { CATALOG_PATTERNS } from '@app/common';

@Controller('api/services')
export class ServicesController implements OnModuleInit {
  constructor(@Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka) {}

  async onModuleInit() {
    [CATALOG_PATTERNS.GET_ALL_SERVICES, CATALOG_PATTERNS.SEARCH_SERVICES, CATALOG_PATTERNS.GET_CATEGORIES, CATALOG_PATTERNS.GET_SERVICES_BY_CATEGORY, CATALOG_PATTERNS.GET_PROVIDERS_BY_SERVICE, CATALOG_PATTERNS.GET_PROVIDER_SERVICES, CATALOG_PATTERNS.GET_PROVIDER_PROFILE_DATA]
      .forEach((p) => this.kafka.subscribeToResponseOf(p));
    await this.kafka.connect();
  }

  @Get('v1')
  async getAll() { return lastValueFrom(this.kafka.send(CATALOG_PATTERNS.GET_ALL_SERVICES, {})); }

  @Get('v2/search')
  async search(@Query('keyword') keyword?: string) { return lastValueFrom(this.kafka.send(CATALOG_PATTERNS.SEARCH_SERVICES, { keyword })); }

  @Get('v1/categories')
  async getCategories() { return lastValueFrom(this.kafka.send(CATALOG_PATTERNS.GET_CATEGORIES, {})); }

  @Get('v1/categories/:categoryName/services')
  async getByCategory(@Param('categoryName') categoryName: string) { return lastValueFrom(this.kafka.send(CATALOG_PATTERNS.GET_SERVICES_BY_CATEGORY, { categoryName })); }

  @Get('v1/providers/:serviceName')
  async getProvidersByService(@Param('serviceName') serviceName: string) { return lastValueFrom(this.kafka.send(CATALOG_PATTERNS.GET_PROVIDERS_BY_SERVICE, { serviceName })); }

  @Get('v1/provider/:providerId/services')
  async getProviderServices(@Param('providerId') providerId: string) { return lastValueFrom(this.kafka.send(CATALOG_PATTERNS.GET_PROVIDER_SERVICES, { providerId })); }

  @Get('v1/provider-profile/:providerId')
  async getProviderProfile(@Param('providerId') providerId: string) { return lastValueFrom(this.kafka.send(CATALOG_PATTERNS.GET_PROVIDER_PROFILE_DATA, { providerId })); }
}
