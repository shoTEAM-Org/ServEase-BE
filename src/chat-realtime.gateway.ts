import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Server, Socket } from 'socket.io';

type JoinChatPayload = {
  contextType?: string;
  contextId?: string;
};

@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class ChatRealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(ChatRealtimeGateway.name);

  constructor(private readonly supabase: SupabaseClient) {}

  async handleConnection(client: Socket) {
    const token = this.extractToken(client);
    if (!token) {
      client.disconnect(true);
      return;
    }

    const { data, error } = await this.supabase.auth.getUser(token);
    if (error || !data.user?.id) {
      this.logger.warn(`Rejected chat socket ${client.id}: invalid token`);
      client.disconnect(true);
      return;
    }

    client.data.userId = data.user.id;
    client.join(this.userRoom(data.user.id));
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Chat socket disconnected: ${client.id}`);
  }

  @SubscribeMessage('chat:join')
  joinConversation(@ConnectedSocket() client: Socket, @MessageBody() payload: JoinChatPayload) {
    if (!client.data.userId) return { ok: false };

    const room = this.contextRoom(payload?.contextType, payload?.contextId);
    if (!room) return { ok: false };

    client.join(room);
    return { ok: true };
  }

  emitMessageCreated(payload: Record<string, unknown>) {
    const room = this.contextRoom(payload.contextType, payload.contextId);
    if (!room) return;
    this.server.to(room).emit('message:new', payload);
  }

  private extractToken(client: Socket) {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim()) return authToken.trim();

    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length).trim();
    }
    return '';
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }

  private contextRoom(contextType: unknown, contextId: unknown) {
    const normalizedType = String(contextType || '').trim();
    const normalizedId = String(contextId || '').trim();
    if (!normalizedType || !normalizedId) return '';
    return `chat:${normalizedType}:${normalizedId}`;
  }
}
