import { 
  WebSocketGateway, 
  SubscribeMessage, 
  MessageBody, 
  ConnectedSocket, 
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/chat'
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;
  
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService
  ) {}

  async handleConnection(client: Socket) {
    try {
      // Expect token in handshake auth: { token: "Bearer eyJ..." }
      const tokenString = client.handshake.auth?.token || client.handshake.headers?.authorization;
      if (!tokenString) throw new Error('No token provided');
      
      const token = tokenString.replace('Bearer ', '').trim();
      const payload = this.jwtService.verify(token);
      
      client.data.user = payload;
      this.logger.log(`[ChatGateway] Client connected: ${client.id} (User: ${payload.userId})`);
    } catch (err) {
      this.logger.warn(`[ChatGateway] Unauthorized connection attempt: ${client.id}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`[ChatGateway] Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket
  ) {
    const userId = client.data.user?.userId;
    if (!userId || !data.roomId) return;

    try {
      client.join(data.roomId);
      this.logger.log(`User ${userId} joined room ${data.roomId}`);
      
      // Fetch history and send only to the connecting user
      const history = await this.chatService.getRoomMessages(data.roomId, userId);
      client.emit('room_history', history);
    } catch (err) {
      this.logger.error(`Error joining room: ${(err as Error).message}`);
      client.emit('error', { message: 'Failed to join room' });
    }
  }

  @SubscribeMessage('send_message')
  async handleMessage(
    @MessageBody() data: { roomId: string; content: string },
    @ConnectedSocket() client: Socket
  ) {
    const userId = client.data.user?.userId;
    if (!userId || !data.roomId || !data.content) return;

    try {
      const savedMsg = await this.chatService.saveMessage(data.roomId, userId, data.content);
      // Broadcast to everyone in the room (including sender)
      this.server.to(data.roomId).emit('new_message', savedMsg);
    } catch (err) {
      this.logger.error(`Error sending message: ${(err as Error).message}`);
      client.emit('error', { message: 'Failed to send message' });
    }
  }
}
