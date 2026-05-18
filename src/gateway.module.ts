import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
  OnApplicationBootstrap,
  Inject,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport, ClientKafka } from '@nestjs/microservices';
import { SupabaseModule } from '@app/database';
import { AuthController } from './controllers/auth.controller.js';
import { UsersController } from './controllers/users.controller.js';
import { BookingController } from './controllers/booking.controller.js';
import { ChatController } from './controllers/chat.controller.js';
import { PaymentController } from './controllers/payment.controller.js';
import { ProviderController } from './controllers/provider.controller.js';
import { CustomerController } from './controllers/customer.controller.js';
import { AdminController } from './controllers/admin.controller.js';
import { ServicesController } from './controllers/services.controller.js';
import { ReferenceController } from './controllers/reference.controller.js';
import { LocationsController } from './controllers/locations.controller.js';
import { NotificationsController } from './controllers/notifications.controller.js';
import { SupportController } from './controllers/support.controller.js';
import { UploadsController } from './controllers/uploads.controller.js';
import { HealthController } from './controllers/health.controller.js';
import { CorrelationMiddleware } from './middleware/correlation.middleware.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SupabaseModule,
    ClientsModule.registerAsync([
      {
        name: 'KAFKA_CLIENT',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.KAFKA,
          options: {
            client: {
              clientId: 'servease-gateway',
              brokers: [config.get<string>('KAFKA_BROKER', 'localhost:9092')],
            },
            consumer: {
              groupId: 'servease-gateway-consumer',
            },
          },
        }),
      },
    ]),
  ],
  controllers: [
    AuthController,
    UsersController,
    BookingController,
    ChatController,
    PaymentController,
    ProviderController,
    CustomerController,
    AdminController,
    ServicesController,
    ReferenceController,
    LocationsController,
    NotificationsController,
    SupportController,
    UploadsController,
    HealthController,
  ],
})
export class GatewayModule implements NestModule, OnApplicationBootstrap {
  constructor(@Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka) {}

  async onApplicationBootstrap() {
    await this.kafka.connect();
  }

  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
