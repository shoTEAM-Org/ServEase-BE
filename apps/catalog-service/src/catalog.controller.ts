import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CATALOG_PATTERNS } from '@app/common';
import { philippineLocations } from '@app/common/mock-data/ph-locations';
import { ServicesService } from './services.service';
import { ReferenceService } from './reference.service';

@Controller()
export class CatalogController {
  constructor(
    private readonly servicesService: ServicesService,
    private readonly referenceService: ReferenceService,
  ) {}

  @MessagePattern(CATALOG_PATTERNS.GET_ALL_SERVICES)
  async getAllServices() {
    return this.servicesService.getMockServices();
  }

  @MessagePattern(CATALOG_PATTERNS.SEARCH_SERVICES)
  async searchServices(@Payload() data: { keyword: string }) {
    return this.servicesService.searchServices(data.keyword);
  }

  @MessagePattern(CATALOG_PATTERNS.GET_CATEGORIES)
  async getCategories() {
    return this.referenceService.getCategories();
  }

  @MessagePattern(CATALOG_PATTERNS.GET_LOCATIONS)
  async getLocations() {
    return { success: true, data: philippineLocations };
  }
}
