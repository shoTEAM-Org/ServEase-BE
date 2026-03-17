import { Controller, Get, Query } from '@nestjs/common';
import { ServicesService } from './services.service';

@Controller('api/services') 
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  getAllServices() {
    return this.servicesService.getMockServices();
  }
  
  @Get('v2/search') 
  async search(@Query('keyword') keyword: string) {
    return this.servicesService.searchServices(keyword);
  }
}