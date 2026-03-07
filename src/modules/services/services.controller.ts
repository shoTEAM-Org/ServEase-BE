import { Controller, Get, Query } from '@nestjs/common';
import { ServicesService } from './services.service';

@Controller('services') 
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get('search') 
  async search(@Query('keyword') keyword: string) {
    return this.servicesService.searchServices(keyword);
  }
}