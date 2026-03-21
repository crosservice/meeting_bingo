import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth';
import { ServerEvents, ClientEvents } from '@meeting-bingo/types';

interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
    nickname: string;
    meetingId?: string;
  };
}

@WebSocketGateway({
  cors: {
    origin: process.env.WEB_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/',
})
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger('WsGateway');

  constructor(private readonly authService: AuthService) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Extract token from cookie or auth header
      const token = this.extractToken(client);
      if (!token) {
        this.logger.warn(`Connection rejected: no token`);
        client.disconnect();
        return;
      }

      const payload = this.authService.verifyAccessToken(token);
      client.data.userId = payload.sub;
      client.data.nickname = payload.nickname;

      this.logger.log(`Client connected: ${payload.nickname} (${client.id})`);
    } catch {
      this.logger.warn(`Connection rejected: invalid token (${client.id})`);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.data?.nickname) {
      this.logger.log(`Client disconnected: ${client.data.nickname} (${client.id})`);
    }
  }

  @SubscribeMessage('join.meeting')
  handleJoinMeeting(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { meeting_id: string },
  ) {
    if (!client.data.userId) return;

    // Leave any previous meeting room
    if (client.data.meetingId) {
      client.leave(`meeting:${client.data.meetingId}`);
    }

    client.join(`meeting:${data.meeting_id}`);
    client.data.meetingId = data.meeting_id;

    this.logger.log(`${client.data.nickname} joined room meeting:${data.meeting_id}`);
    return { status: 'ok' };
  }

  @SubscribeMessage('leave.meeting')
  handleLeaveMeeting(@ConnectedSocket() client: AuthenticatedSocket) {
    if (client.data.meetingId) {
      client.leave(`meeting:${client.data.meetingId}`);
      this.logger.log(`${client.data.nickname} left room meeting:${client.data.meetingId}`);
      client.data.meetingId = undefined;
    }
    return { status: 'ok' };
  }

  @SubscribeMessage(ClientEvents.PresencePing)
  handlePresencePing(@ConnectedSocket() client: AuthenticatedSocket) {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  // --- Emit helpers used by other services ---

  emitToMeeting(meetingId: string, event: string, data: unknown) {
    this.server.to(`meeting:${meetingId}`).emit(event, data);
  }

  emitToUser(userId: string, event: string, data: unknown) {
    // Find all sockets for this user
    const sockets = this.server.sockets.sockets;
    for (const [, socket] of sockets) {
      const authSocket = socket as AuthenticatedSocket;
      if (authSocket.data?.userId === userId) {
        authSocket.emit(event, data);
      }
    }
  }

  private extractToken(client: Socket): string | undefined {
    // Try handshake auth
    const authToken = client.handshake.auth?.token;
    if (authToken) return authToken;

    // Try cookie
    const cookies = client.handshake.headers.cookie;
    if (cookies) {
      const match = cookies.match(/access_token=([^;]+)/);
      if (match) return match[1];
    }

    return undefined;
  }
}
