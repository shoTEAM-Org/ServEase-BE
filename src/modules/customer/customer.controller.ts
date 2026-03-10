import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { CustomerDashboardResponseDto } from './dto/customer-dashboard.dto';

@Controller('api/customer')
export class CustomerController {
    constructor(private readonly customerService: CustomerService) {}

    @Get(':id/dashboard')
    async getDashboard(
        @Param('id', ParseUUIDPipe) customerId: string
    ): Promise<CustomerDashboardResponseDto[]> {
        return this.customerService.getDashboardData(customerId);
    }
}