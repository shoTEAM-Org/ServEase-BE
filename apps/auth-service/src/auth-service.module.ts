import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { SupabaseModule } from '@app/database';
import { AuthService } from './auth.service.js';
import { UsersService } from './users.service.js';
import { AuthKafkaController } from './auth.controller.js';

@Module({
  imports: [
    SupabaseModule,
    ClientsModule.register([
      {
        name: 'KAFKA_CLIENT',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: 'auth-service-client',
            brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
          },
          consumer: { groupId: 'auth-service-client-consumer' },
        },
      },
    ]),
  ],
  controllers: [AuthKafkaController],
  providers: [AuthService, UsersService],
  exports: [AuthService, UsersService],
})
export class AuthServiceModule {}
