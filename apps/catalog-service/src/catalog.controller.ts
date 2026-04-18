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

  @MessagePattern(CATALOG_PATTERNS.GET_ADMIN_CATEGORIES)
  async getAdminCategories(@Payload() data: any) {
    return this.servicesService.getCategoriesAdmin(data?.page, data?.limit);
  }

  @MessagePattern(CATALOG_PATTERNS.CREATE_ADMIN_CATEGORY)
  async createAdminCategory(@Payload() data: any) {
    return this.servicesService.createCategoryAdmin(data);
  }

  @MessagePattern(CATALOG_PATTERNS.UPDATE_ADMIN_CATEGORY)
  async updateAdminCategory(@Payload() data: any) {
    return this.servicesService.updateCategoryAdmin(data?.id, data?.body);
  }

  @MessagePattern(CATALOG_PATTERNS.DELETE_ADMIN_CATEGORY)
  async deleteAdminCategory(@Payload() data: any) {
    return this.servicesService.deleteCategoryAdmin(data?.id);
  }

  @MessagePattern(CATALOG_PATTERNS.GET_ADMIN_SERVICES)
  async getAdminServices(@Payload() data: any) {
    return this.servicesService.getAllServicesAdmin(data?.page, data?.limit);
  }

  @MessagePattern(CATALOG_PATTERNS.UPDATE_ADMIN_SERVICE)
  async updateAdminService(@Payload() data: any) {
    return this.servicesService.updateServiceAdmin(data?.id, data?.body);
  }

  @MessagePattern(CATALOG_PATTERNS.DELETE_ADMIN_SERVICE)
  async deleteAdminService(@Payload() data: any) {
    return this.servicesService.deleteServiceAdmin(data?.id);
  }

  @MessagePattern(CATALOG_PATTERNS.GET_ADMIN_SERVICE_AREAS)
  async getAdminServiceAreas() {
    return this.servicesService.getServiceAreasAdmin();
  }

  @MessagePattern(CATALOG_PATTERNS.CREATE_ADMIN_SERVICE_AREA)
  async createAdminServiceArea(@Payload() data: any) {
    return this.servicesService.createServiceAreaAdmin(data);
  }

  @MessagePattern(CATALOG_PATTERNS.UPDATE_ADMIN_SERVICE_AREA)
  async updateAdminServiceArea(@Payload() data: any) {
    return this.servicesService.updateServiceAreaAdmin(data?.id, data?.body);
  }

  @MessagePattern(CATALOG_PATTERNS.DELETE_ADMIN_SERVICE_AREA)
  async deleteAdminServiceArea(@Payload() data: any) {
    return this.servicesService.deleteServiceAreaAdmin(data?.id);
  }
}
