import { Controller, Get, Param, ParseUUIDPipe, Inject, OnModuleInit } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { CUSTOMER_PATTERNS } from '@app/common';

@Controller('api/customer')
export class CustomerController implements OnModuleInit {
  constructor(@Inject('CUSTOMER_SERVICE') private readonly customerClient: ClientKafka) {}

  async onModuleInit() {
    this.customerClient.subscribeToResponseOf(CUSTOMER_PATTERNS.GET_DASHBOARD);
    await this.customerClient.connect();
  }

  @Get('v1/dashboard/:id')
  async getDashboard(@Param('id', ParseUUIDPipe) customerId: string) {
    return lastValueFrom(this.customerClient.send(CUSTOMER_PATTERNS.GET_DASHBOARD, { customerId }));
  }
}
