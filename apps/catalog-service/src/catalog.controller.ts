import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CATALOG_PATTERNS } from '@app/common';
import { ServicesService } from './services.service.js';
import { ReferenceService } from './reference.service.js';
import { LocationsService } from './locations.service.js';

@Controller()
export class CatalogKafkaController {
  constructor(
    @Inject(ServicesService) private readonly servicesService: ServicesService,
    @Inject(ReferenceService) private readonly referenceService: ReferenceService,
    @Inject(LocationsService) private readonly locationsService: LocationsService,
  ) {}

  @MessagePattern(CATALOG_PATTERNS.GET_ALL_SERVICES)
  async getAllServices() {
    return this.servicesService.getAllServices();
  }

  @MessagePattern(CATALOG_PATTERNS.SEARCH_SERVICES)
  async searchServices(@Payload() data: any) {
    return this.servicesService.searchServices(data.keyword);
  }

  @MessagePattern(CATALOG_PATTERNS.GET_CATEGORIES)
  async getCategories() {
    return this.servicesService.getCategories();
  }

  @MessagePattern(CATALOG_PATTERNS.GET_SERVICES_BY_CATEGORY)
  async getServicesByCategory(@Payload() data: any) {
    return this.servicesService.getServicesByCategory(data.categoryName);
  }

  @MessagePattern(CATALOG_PATTERNS.GET_PROVIDERS_BY_SERVICE)
  async getProvidersByServiceName(@Payload() data: any) {
    return this.servicesService.getProvidersByServiceName(data.serviceName);
  }

  @MessagePattern(CATALOG_PATTERNS.GET_PROVIDER_SERVICES)
  async getProviderServices(@Payload() data: any) {
    return this.servicesService.getProviderServices(data.providerId);
  }

  @MessagePattern(CATALOG_PATTERNS.GET_PROVIDER_PROFILE_DATA)
  async getProviderProfileData(@Payload() data: any) {
    return this.servicesService.getProviderProfileData(data.providerId);
  }

  @MessagePattern(CATALOG_PATTERNS.GET_REFERENCE_CATEGORIES)
  async getReferenceCategories() {
    return this.referenceService.getCategories();
  }

  @MessagePattern(CATALOG_PATTERNS.GET_LOCATIONS)
  async getLocations() {
    return this.locationsService.getLocations();
  }

  @MessagePattern(CATALOG_PATTERNS.GET_PROVINCES)
  async getProvinces() {
    return this.locationsService.getProvinces();
  }

  @MessagePattern(CATALOG_PATTERNS.GET_CITIES)
  async getCities(@Payload() data: any) {
    return this.locationsService.getCities(data.provinceCode);
  }

  @MessagePattern(CATALOG_PATTERNS.GET_BARANGAYS)
  async getBarangays(@Payload() data: any) {
    return this.locationsService.getBarangays(data.cityCode);
  }
}
