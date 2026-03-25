import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { Partitioners } from 'kafkajs';
import { AuthController } from './controllers/auth.controller.js';
import { BookingController } from './controllers/booking.controller.js';
import { PaymentController } from './controllers/payment.controller.js';
import { ProviderController } from './controllers/provider.controller.js';
import { CustomerController } from './controllers/customer.controller.js';
import { AdminController } from './controllers/admin.controller.js';
import { UsersController } from './controllers/users.controller.js';
import { ServicesController } from './controllers/services.controller.js';
import { ReferenceController } from './controllers/reference.controller.js';
import { LocationsController } from './controllers/locations.controller.js';

const kafkaBroker = process.env.KAFKA_BROKER || 'localhost:9092';

function kafkaClient(name: string, clientId: string, groupId: string) {
  return {
    name,
    transport: Transport.KAFKA as const,
    options: {
      client: { clientId, brokers: [kafkaBroker] },
      consumer: { groupId },
      producer: { createPartitioner: Partitioners.LegacyPartitioner },
    },
  };
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ClientsModule.register([
      kafkaClient('AUTH_SERVICE', 'gateway-auth', 'gateway-auth-group'),
      kafkaClient('BOOKING_SERVICE', 'gateway-booking', 'gateway-booking-group'),
      kafkaClient('PAYMENT_SERVICE', 'gateway-payment', 'gateway-payment-group'),
      kafkaClient('PROVIDER_SERVICE', 'gateway-provider', 'gateway-provider-group'),
      kafkaClient('CUSTOMER_SERVICE', 'gateway-customer', 'gateway-customer-group'),
      kafkaClient('ADMIN_SERVICE', 'gateway-admin', 'gateway-admin-group'),
      kafkaClient('CATALOG_SERVICE', 'gateway-catalog', 'gateway-catalog-group'),
    ]),
  ],
  controllers: [
    AuthController,
    BookingController,
    PaymentController,
    ProviderController,
    CustomerController,
    AdminController,
    UsersController,
    ServicesController,
    ReferenceController,
    LocationsController,
  ],
})
export class GatewayModule {}
