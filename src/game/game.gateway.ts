import {
  WebSocketGateway,
  SubscribeMessage,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GameService } from './game.service';

@WebSocketGateway(
  { cors: { origin: '*' } }) // Разрешаем запросы со всех доменов
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly gameService: GameService) {}

  // 📌 Подключение игрока
  async handleConnection(client: Socket) {
    try {
      console.log(`✅ Игрок подключился: ${client.id}`);
    } catch (error) {
      console.error('❌ Ошибка подключения:', error);
      client.disconnect();
    }
  }
  

  // 📌 Отключение игрока
  async handleDisconnect(client: Socket) {
    console.log(`Игрок отключился: ${client.id}`);
  }

  // 📌 Игрок присоединяется к игре
  @SubscribeMessage('joinGame')
  async joinGame(client: Socket, gameId: string) {
    client.join(gameId);
    console.log(`Игрок ${client.id} присоединился к игре ${gameId}`);

    // Отправляем обновленный список игроков в комнате
    const players = await this.gameService.getPlayers(gameId);
    this.server.to(gameId).emit('playersUpdated', players);
  }

  // 📌 Игрок отправляет сообщение в чат
  @SubscribeMessage('sendMessage')
  async sendMessage(client: Socket, payload: { gameId: string; message: string; userId: string }) {
    this.server.to(payload.gameId).emit('newMessage', {
      userId: payload.userId,
      message: payload.message,
      timestamp: new Date(),
    });
  }
}
