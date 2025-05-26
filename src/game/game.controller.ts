import { JwtAuthGuard } from '@/src/auth/jwtAuth.guard'
import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common'
import { CreateCompetitionDto, JoinCompetitionDto } from './dto/competition.dto'
import { GameService } from './game.service'

@Controller('games')
export class GameController {
	constructor(
		private gameService: GameService
	) { }

	// =================== ОБЫЧНЫЕ ИГРЫ ===================

	/**
	 * 👥 Получение игроков игры
	 */
	@Get(':gameId/players')
	async getPlayers(@Param('gameId') gameId: string) {
		return this.gameService.getPlayers(gameId)
	}

	// =================== СОРЕВНОВАНИЯ ===================

	/**
	 * 🏆 Создание нового соревнования
	 */
	@Post('competitions')
	@UseGuards(JwtAuthGuard)
	async createCompetition(
		@Request() req,
		@Body() dto: CreateCompetitionDto
	) {
		const userId = req.user.id
		return this.gameService.createCompetition(userId, dto)
	}

	/**
	 * 🎮 Подключение к соревнованию (авторизованные пользователи)
	 */
	@Post('competitions/join')
	@UseGuards(JwtAuthGuard)
	async joinCompetition(
		@Request() req,
		@Body() dto: Omit<JoinCompetitionDto, 'userId'>
	) {
		const userId = req.user.id
		return this.gameService.joinCompetition({ ...dto, userId })
	}

	/**
	 * 🎮 Подключение к соревнованию как гость (без авторизации)
	 */
	@Post('competitions/join-guest')
	async joinCompetitionAsGuest(@Body() dto: JoinCompetitionDto) {
		return this.gameService.joinCompetition(dto)
	}

	/**
	 * 👥 Выбор команды
	 */
	@Post('competitions/:competitionId/teams/:teamId/select')
	async selectTeam(
		@Param('competitionId') competitionId: string,
		@Param('teamId') teamId: string,
		@Body('participantId') participantId: string
	) {
		return this.gameService.selectTeam(competitionId, teamId, participantId)
	}

	/**
	 * 🎯 Выбор игрока команды
	 */
	@Post('competitions/:competitionId/teams/:teamId/player')
	async selectPlayer(
		@Param('competitionId') competitionId: string,
		@Param('teamId') teamId: string,
		@Body('participantId') participantId: string
	) {
		return this.gameService.selectPlayer(competitionId, teamId, participantId)
	}

	/**
	 * 🚀 Запуск соревнования
	 */
	@Post('competitions/:competitionId/start')
	@UseGuards(JwtAuthGuard)
	async startCompetition(
		@Param('competitionId') competitionId: string,
		@Request() req
	) {
		const userId = req.user.id
		return this.gameService.startCompetition(competitionId, userId)
	}

	/**
	 * 📊 Получение информации о соревновании
	 */
	@Get('competitions/:competitionId')
	async getCompetition(
		@Param('competitionId') competitionId: string,
		@Query('userId') userId?: string
	) {
		return this.gameService.getCompetition(competitionId, userId)
	}

	/**
	 * 🏆 Получение таблицы лидеров
	 */
	@Get('competitions/:competitionId/leaderboard')
	async getLeaderboard(@Param('competitionId') competitionId: string) {
		return this.gameService.getLeaderboard(competitionId)
	}

	/**
	 * 💬 Получение истории чата команды
	 */
	@Get('competitions/:competitionId/teams/:teamId/chat')
	async getTeamChat(
		@Param('competitionId') competitionId: string,
		@Param('teamId') teamId: string,
		@Query('participantId') participantId: string
	) {
		return this.gameService.getTeamChat(competitionId, teamId, participantId)
	}

	/**
	 * 🔍 Поиск соревнования по коду
	 */
	@Get('competitions/code/:code')
	async findByCode(@Param('code') code: string) {
		return this.gameService.findCompetitionByCode(code)
	}

	// =================== ТЕСТИРОВАНИЕ ===================

	/**
	 * 📝 Получение текущего вопроса
	 */
	@Get('competitions/:competitionId/question')
	async getCurrentQuestion(
		@Param('competitionId') competitionId: string,
		@Query('participantId') participantId: string
	) {
		return this.gameService.getCurrentQuestion(participantId)
	}

	/**
	 * ✍️ Отправка ответа на вопрос
	 */
	@Post('competitions/:competitionId/answer')
	async submitAnswer(
		@Param('competitionId') competitionId: string,
		@Body() dto: {
			participantId: string
			questionId: string
			selectedAnswers?: string[]
			userAnswer?: string
		}
	) {
		return this.gameService.submitAnswer(
			dto.participantId,
			dto.questionId,
			{
				selectedAnswers: dto.selectedAnswers,
				userAnswer: dto.userAnswer
			}
		)
	}

	/**
	 * 📊 Получение прогресса команды
	 */
	@Get('competitions/:competitionId/progress')
	async getTeamProgress(
		@Param('competitionId') competitionId: string,
		@Query('participantId') participantId: string
	) {
		return this.gameService.getTeamProgress(participantId)
	}
} 