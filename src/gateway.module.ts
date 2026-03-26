import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { Partitioners } from 'kafkajs';
import { AuthController } from './controllers/auth.controller';
import { BookingController } from './controllers/booking.controller';
import { PaymentController } from './controllers/payment.controller';
import { ProviderController } from './controllers/provider.controller';
import { CustomerController } from './controllers/customer.controller';
import { AdminController } from './controllers/admin.controller';
import { UsersController } from './controllers/users.controller';
import { ServicesController } from './controllers/services.controller';
import { ReferenceController } from './controllers/reference.controller';
import { LocationsController } from './controllers/locations.controller';

const kafkaBroker = process.env.KAFKA_BROKER || 'localhost:9092';

function kafkaClient(name: string, clientId: string, groupId: string) {
  return {
    name,
    transport: Transport.KAFKA as const,
    options: {
      client: {
        clientId,
        brokers: [kafkaBroker],
        retry: {
          initialRetryTime: 300,
          retries: 10,
        },
      },
      consumer: {
        groupId,
        retry: { initialRetryTime: 300, retries: 10 },
      },
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
