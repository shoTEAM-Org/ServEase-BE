import {Controller, Get, Param } from '@nestjs/common';
import { CustomerService} from './customer.service';

@Controller('api/customer')
export class CustomerController {
    constructor(private readonly customerService: CustomerService) {}

    @Get(':id/dashboard')
    async getDashboard(@Param('id') customerId: string) {
        return this.customerService.getDashboardData(customerId);
    }
}