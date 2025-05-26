import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { GameService } from './game.service'

interface AuthenticatedSocket extends Socket {
  userId?: string
  participantId?: string
  competitionId?: string
}

@WebSocketGateway({ cors: { origin: '*' } })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server

  constructor(
    private readonly gameService: GameService
  ) { }

  // =================== БАЗОВЫЕ СОБЫТИЯ ===================

  /**
   * 🔌 Подключение клиента
   */
  async handleConnection(client: AuthenticatedSocket) {
    try {
      console.log(`🎮 Client connected: ${client.id}`)
    } catch (error) {
      console.error('❌ Connection error:', error)
      client.disconnect()
    }
  }

  /**
   * 🔌 Отключение клиента
   */
  async handleDisconnect(client: AuthenticatedSocket) {
    if (client.competitionId) {
      // Уведомляем других участников об отключении
      client.to(`competition:${client.competitionId}`).emit('participantDisconnected', {
        participantId: client.participantId
      })
    }
    console.log(`🎮 Client disconnected: ${client.id}`)
  }

  // =================== ОБЫЧНЫЕ ИГРЫ ===================

  /**
   * 📌 Игрок присоединяется к игре
   */
  @SubscribeMessage('joinGame')
  async joinGame(client: Socket, gameId: string) {
    client.join(gameId)
    console.log(`Игрок ${client.id} присоединился к игре ${gameId}`)

    // Отправляем обновленный список игроков в комнате
    const players = await this.gameService.getPlayers(gameId)
    this.server.to(gameId).emit('playersUpdated', players)
  }

  /**
   * 📌 Игрок отправляет сообщение в чат
   */
  @SubscribeMessage('sendMessage')
  async sendMessage(client: Socket, payload: { gameId: string; message: string; userId: string }) {
    this.server.to(payload.gameId).emit('newMessage', {
      userId: payload.userId,
      message: payload.message,
      timestamp: new Date(),
    })
  }

  // =================== СОРЕВНОВАНИЯ ===================

  /**
   * 🏆 Присоединение к соревнованию
   */
  @SubscribeMessage('joinCompetition')
  async handleJoinCompetition(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { competitionId: string; participantId: string }
  ) {
    try {
      const { competitionId, participantId } = payload

      // Сохраняем информацию о клиенте
      client.competitionId = competitionId
      client.participantId = participantId

      // Подключаем к комнате соревнования
      await client.join(`competition:${competitionId}`)

      // Получаем актуальные данные соревнования
      const competition = await this.gameService.getCompetition(competitionId)

      // Отправляем данные подключившемуся клиенту
      client.emit('competitionJoined', { competition })

      // Уведомляем других участников о новом подключении (включая создателя)
      client.to(`competition:${competitionId}`).emit('participantJoined', {
        participant: competition.participants.find(p => p.id === participantId)
      })

      // Отправляем обновленные данные создателю в реальном времени
      await this.broadcastCompetitionUpdate(competitionId)

      console.log(`👤 Participant ${participantId} joined competition ${competitionId}`)
    } catch (error) {
      console.error('Error joining competition:', error)
      client.emit('error', { message: 'Failed to join competition' })
    }
  }

  /**
   * 👥 Выбор команды
   */
  @SubscribeMessage('selectTeam')
  async handleSelectTeam(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { competitionId: string; teamId: string; participantId: string }
  ) {
    try {
      const { competitionId, teamId, participantId } = payload

      // Выбираем команду
      const competition = await this.gameService.selectTeam(
        competitionId,
        teamId,
        participantId
      )

      // Подключаем к комнате команды
      await client.join(`team:${teamId}`)

      // Уведомляем всех участников соревнования об изменении
      this.server.to(`competition:${competitionId}`).emit('competitionUpdated', {
        competition
      })

      console.log(`👥 Participant ${participantId} selected team ${teamId}`)
    } catch (error) {
      console.error('Error selecting team:', error)
      client.emit('error', { message: 'Failed to select team' })
    }
  }

  /**
   * 🎯 Выбор игрока команды
   */
  @SubscribeMessage('selectPlayer')
  async handleSelectPlayer(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { competitionId: string; teamId: string; selectedPlayerId: string }
  ) {
    try {
      const { competitionId, teamId, selectedPlayerId } = payload

      // Выбираем игрока
      const competition = await this.gameService.selectPlayer(
        competitionId,
        teamId,
        selectedPlayerId
      )

      // Уведомляем всех участников соревнования
      this.server.to(`competition:${competitionId}`).emit('competitionUpdated', {
        competition
      })

      console.log(`🎯 Player ${selectedPlayerId} selected for team ${teamId}`)
    } catch (error) {
      console.error('Error selecting player:', error)
      client.emit('error', { message: 'Failed to select player' })
    }
  }

  /**
   * 🚀 Запуск соревнования
   */
  @SubscribeMessage('startCompetition')
  async handleStartCompetition(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { competitionId: string; userId: string }
  ) {
    try {
      const { competitionId, userId } = payload

      // Запускаем соревнование
      const competition = await this.gameService.startCompetition(competitionId, userId)

      // Уведомляем всех участников
      this.server.to(`competition:${competitionId}`).emit('competitionStarted', {
        competition
      })

      console.log(`🚀 Competition ${competitionId} started by ${userId}`)
    } catch (error) {
      console.error('Error starting competition:', error)
      client.emit('error', { message: 'Failed to start competition' })
    }
  }

  /**
   * 💬 Отправка сообщения в чат команды
   */
  @SubscribeMessage('teamChat')
  async handleTeamChat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { competitionId: string; teamId: string; message: string; participantId: string }
  ) {
    try {
      const { competitionId, teamId, message, participantId } = payload

      // Отправляем сообщение
      await this.gameService.sendTeamMessage(
        competitionId,
        teamId,
        participantId,
        message
      )

      // Получаем данные участника
      const competition = await this.gameService.getCompetition(competitionId)
      const participant = competition.participants.find(p => p.id === participantId)

      // Отправляем сообщение всем участникам команды
      this.server.to(`team:${teamId}`).emit('teamMessage', {
        id: Date.now().toString(),
        participantName: participant?.displayName || 'Unknown',
        message,
        timestamp: new Date().toISOString(),
        isOwn: false
      })

      console.log(`💬 Message sent to team ${teamId} by ${participantId}`)
    } catch (error) {
      console.error('Error sending team message:', error)
      client.emit('error', { message: 'Failed to send message' })
    }
  }

  /**
   * 📊 Получение обновленной таблицы лидеров
   */
  @SubscribeMessage('getLeaderboard')
  async handleGetLeaderboard(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { competitionId: string }
  ) {
    try {
      const { competitionId } = payload

      const leaderboard = await this.gameService.getLeaderboard(competitionId)

      client.emit('leaderboardUpdated', { leaderboard })
    } catch (error) {
      console.error('Error getting leaderboard:', error)
      client.emit('error', { message: 'Failed to get leaderboard' })
    }
  }

  // =================== ТЕСТИРОВАНИЕ ===================

  /**
   * 📝 Получение текущего вопроса
   */
  @SubscribeMessage('getCurrentQuestion')
  async handleGetCurrentQuestion(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { participantId: string }
  ) {
    try {
      const question = await this.gameService.getCurrentQuestion(payload.participantId)
      client.emit('currentQuestion', { question })
    } catch (error) {
      console.error('Error getting current question:', error)
      client.emit('error', { message: 'Failed to get current question' })
    }
  }

  /**
   * ✍️ Отправка ответа на вопрос
   */
  @SubscribeMessage('submitAnswer')
  async handleSubmitAnswer(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: {
      participantId: string
      questionId: string
      selectedAnswers?: string[]
      userAnswer?: string
    }
  ) {
    try {
      const result = await this.gameService.submitAnswer(
        payload.participantId,
        payload.questionId,
        {
          selectedAnswers: payload.selectedAnswers,
          userAnswer: payload.userAnswer
        }
      )

      // Отправляем результат ответа
      client.emit('answerResult', result)

      // Если есть следующий вопрос, отправляем его
      if (result.nextQuestionId) {
        const nextQuestion = await this.gameService.getCurrentQuestion(payload.participantId)
        client.emit('currentQuestion', { question: nextQuestion })
      }

      // Если тест завершен, отправляем финальную таблицу лидеров
      if (result.isTestCompleted && client.competitionId) {
        await this.broadcastLeaderboardUpdate(client.competitionId)
      }
    } catch (error) {
      console.error('Error submitting answer:', error)
      client.emit('error', { message: 'Failed to submit answer' })
    }
  }

  /**
   * 📊 Получение прогресса команды
   */
  @SubscribeMessage('getTeamProgress')
  async handleGetTeamProgress(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { participantId: string }
  ) {
    try {
      const progress = await this.gameService.getTeamProgress(payload.participantId)
      client.emit('teamProgress', { progress })
    } catch (error) {
      console.error('Error getting team progress:', error)
      client.emit('error', { message: 'Failed to get team progress' })
    }
  }

  // =================== UTILITY METHODS ===================

  /**
   * Отправка обновления всем участникам соревнования
   */
  async broadcastCompetitionUpdate(competitionId: string) {
    try {
      const competition = await this.gameService.getCompetition(competitionId)

      this.server.to(`competition:${competitionId}`).emit('competitionUpdated', {
        competition
      })
    } catch (error) {
      console.error('Error broadcasting competition update:', error)
    }
  }

  /**
   * Отправка обновления таблицы лидеров
   */
  async broadcastLeaderboardUpdate(competitionId: string) {
    try {
      const leaderboard = await this.gameService.getLeaderboard(competitionId)

      this.server.to(`competition:${competitionId}`).emit('leaderboardUpdated', {
        leaderboard
      })
    } catch (error) {
      console.error('Error broadcasting leaderboard update:', error)
    }
  }

  /**
   * Уведомление о завершении соревнования
   */
  async notifyCompetitionCompleted(competitionId: string) {
    try {
      const leaderboard = await this.gameService.getLeaderboard(competitionId)

      this.server.to(`competition:${competitionId}`).emit('competitionCompleted', {
        leaderboard
      })
    } catch (error) {
      console.error('Error notifying competition completion:', error)
    }
  }
}
