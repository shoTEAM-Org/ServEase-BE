import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { SupabaseModule } from '@app/database';
import { ChatService } from './chat.service.js';
import { ChatKafkaController } from './chat.controller.js';

@Module({
  imports: [
    SupabaseModule,
    ClientsModule.register([
      {
        name: 'KAFKA_CLIENT',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: 'chat-service-client',
            brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
          },
          consumer: { groupId: 'chat-service-client-consumer' },
        },
      },
    ]),
  ],
  controllers: [ChatKafkaController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatServiceModule {}
