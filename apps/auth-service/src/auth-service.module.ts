import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { SupabaseModule } from '@app/database';
import { TribeClientModule } from '@app/common';
import { AuthService } from './auth.service.js';
import { UsersService } from './users.service.js';
import { AuthKafkaController } from './auth.controller.js';

const authClientInstanceId = `${process.pid}-${Date.now()}`;

@Module({
  imports: [
    SupabaseModule,
    TribeClientModule,
    ClientsModule.register([
      {
        name: 'KAFKA_CLIENT',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: `auth-service-client-${authClientInstanceId}`,
            brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
          },
          consumer: {
            groupId: `auth-service-client-consumer-${authClientInstanceId}`,
          },
        },
      },
    ]),
  ],
  controllers: [AuthKafkaController],
  providers: [AuthService, UsersService],
  exports: [AuthService, UsersService],
})
export class AuthServiceModule {}
