import { PrismaService } from '@/prisma/prisma.service'
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { CompetitionStatus } from '@prisma/client'
import {
	CompetitionResponse,
	CreateCompetitionDto,
	CreatorDashboardParticipant,
	CreatorDashboardResponse,
	CreatorDashboardTeam,
	JoinCompetitionDto,
	LeaderboardResponse,
	ParticipantResponse,
	TeamChatMessage,
	TeamChatResponse,
	TeamResponse
} from './dto/competition.dto'

@Injectable()
export class GameService {
	private readonly TEAM_COLORS = [
		'#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
		'#FECA57', '#FF9FF3', '#54A0FF', '#5F27CD',
		'#00D2D3', '#FF9F43'
	]

	constructor(private prisma: PrismaService) { }

	// =================== ОБЫЧНЫЕ ИГРЫ ===================

	/**
	 * 🎮 Создание новой игры
	 */
	async createGame(userId: string) {
		const game = await this.prisma.game.create({
			data: {
				creatorId: userId,
				isPublic: false
			},
			include: {
				creator: { select: { id: true, name: true, email: true } },
				players: { select: { id: true, name: true, email: true } },
				chat: true
			}
		})

		// Создаем чат для игры
		await this.prisma.chat.create({
			data: { gameId: game.id }
		})

		return game
	}

	/**
	 * 👥 Получение списка игроков
	 */
	async getPlayers(gameId: string) {
		const game = await this.prisma.game.findUnique({
			where: { id: gameId },
			include: { players: { select: { id: true, name: true, email: true } } },
		})

		if (!game) {
			throw new NotFoundException('Game not found')
		}

		return game.players
	}

	// =================== СОРЕВНОВАНИЯ ===================

	/**
	 * 🏆 Создание нового соревнования
	 */
	async createCompetition(userId: string, dto: CreateCompetitionDto): Promise<CompetitionResponse> {
		// Проверяем существование и статус теста
		const test = await this.prisma.test.findUnique({
			where: { id: dto.testId },
			include: { creator: { select: { name: true } } }
		})

		if (!test) {
			throw new NotFoundException('Test not found')
		}

		if (test.creatorId !== userId) {
			throw new ForbiddenException('You can only create competitions for your own tests')
		}

		if (test.isDraft) {
			throw new BadRequestException('Cannot create competition for draft test. Please publish the test first.')
		}

		// Проверяем минимальное количество команд
		const maxTeams = Math.max(dto.maxTeams || 2, 2) // Минимум 2 команды

		// Генерируем уникальный 6-значный код
		const code = await this.generateUniqueCode()

		// Создаем соревнование
		const competition = await this.prisma.competition.create({
			data: {
				code,
				title: dto.title || `${test.title} Competition`,
				testId: dto.testId,
				creatorId: userId,
				maxTeams: maxTeams
			}
		})

		// Создаем команды
		await this.createTeams(competition.id, maxTeams)

		return this.formatCompetitionResponse(competition.id, userId)
	}

	/**
	 * 🎮 Подключение к соревнованию (авторизованные + гости)
	 */
	async joinCompetition(dto: JoinCompetitionDto): Promise<{
		competition: CompetitionResponse,
		participantId: string
	}> {
		const competition = await this.prisma.competition.findUnique({
			where: { code: dto.code },
			include: {
				test: true,
				participants: true
			}
		})

		if (!competition) {
			throw new NotFoundException('Competition room not found')
		}

		if (competition.status !== CompetitionStatus.WAITING) {
			throw new BadRequestException('Competition is not accepting new participants')
		}

		// Проверяем, не подключен ли уже авторизованный пользователь
		if (dto.userId) {
			const existingParticipant = competition.participants.find(p => p.userId === dto.userId)
			if (existingParticipant) {
				throw new BadRequestException('User already joined this competition')
			}
		}

		// Создаем участника (гость или авторизованный)
		const participant = await this.prisma.competitionParticipant.create({
			data: {
				competitionId: competition.id,
				userId: dto.userId || null,
				displayName: dto.displayName,
				isGuest: !dto.userId
			}
		})

		const competitionResponse = await this.formatCompetitionResponse(competition.id, dto.userId)

		return {
			competition: competitionResponse,
			participantId: participant.id
		}
	}

	/**
	 * 👥 Выбор команды участником
	 */
	async selectTeam(competitionId: string, teamId: string, participantId: string): Promise<CompetitionResponse> {
		const participant = await this.prisma.competitionParticipant.findUnique({
			where: { id: participantId },
			include: { competition: true, team: true }
		})

		if (!participant || participant.competitionId !== competitionId) {
			throw new NotFoundException('Participant not found')
		}

		if (participant.competition.status !== CompetitionStatus.WAITING) {
			throw new BadRequestException('Cannot change team after competition started')
		}

		// Проверяем, что команда принадлежит соревнованию
		const team = await this.prisma.team.findFirst({
			where: { id: teamId, competitionId },
			include: { participants: true }
		})

		if (!team) {
			throw new NotFoundException('Team not found')
		}

		// Обновляем участника
		await this.prisma.competitionParticipant.update({
			where: { id: participantId },
			data: { teamId }
		})

		return this.formatCompetitionResponse(competitionId, participant.userId ? participant.userId : undefined)
	}

	/**
	 * 🎯 Выбор игрока команды для ответов на вопросы
	 */
	async selectPlayer(competitionId: string, teamId: string, participantId: string): Promise<CompetitionResponse> {
		const team = await this.prisma.team.findFirst({
			where: { id: teamId, competitionId },
			include: {
				participants: true,
				competition: true
			}
		})

		if (!team) {
			throw new NotFoundException('Team not found')
		}

		if (team.competition.status !== CompetitionStatus.WAITING) {
			throw new BadRequestException('Cannot change selected player after competition started')
		}

		// Проверяем, что участник принадлежит команде
		const participant = team.participants.find(p => p.id === participantId)
		if (!participant) {
			throw new BadRequestException('Participant is not in this team')
		}

		// Обновляем выбранного игрока
		await this.prisma.team.update({
			where: { id: teamId },
			data: { selectedPlayerId: participantId }
		})

		return this.formatCompetitionResponse(competitionId, participant.userId || undefined)
	}

	/**
	 * 🚀 Запуск соревнования
	 */
	async startCompetition(competitionId: string, userId: string): Promise<CompetitionResponse> {
		const competition = await this.prisma.competition.findUnique({
			where: { id: competitionId },
			include: {
				teams: {
					include: {
						participants: true,
						selectedPlayer: true
					}
				}
			}
		})

		if (!competition) {
			throw new NotFoundException('Competition not found')
		}

		if (competition.creatorId !== userId) {
			throw new ForbiddenException('Only creator can start the competition')
		}

		if (competition.status !== CompetitionStatus.WAITING) {
			throw new BadRequestException('Competition already started or finished')
		}

		// Проверяем готовность команд (минимум 2 команды с участниками и выбранными игроками)
		const teamsWithPlayers = competition.teams.filter(team =>
			team.participants.length > 0 && team.selectedPlayer
		)

		if (teamsWithPlayers.length < 2) {
			throw new BadRequestException('At least 2 teams with selected players required to start')
		}

		// Обновляем статус соревнования
		await this.prisma.competition.update({
			where: { id: competitionId },
			data: {
				status: CompetitionStatus.IN_PROGRESS,
				startedAt: new Date()
			}
		})

		// Создаем попытки для каждой команды
		for (const team of teamsWithPlayers) {
			const attempt = await this.prisma.attempt.create({
				data: {
					userId: team.selectedPlayer!.userId || team.selectedPlayer!.id,
					testId: competition.testId,
					mode: 'PRACTICE',
					status: 'IN_PROGRESS'
				}
			})

			// Связываем команду с попыткой
			await this.prisma.team.update({
				where: { id: team.id },
				data: { attemptId: attempt.id }
			})
		}

		return this.formatCompetitionResponse(competitionId, userId)
	}

	/**
	 * 📊 Получение информации о соревновании
	 */
	async getCompetition(competitionId: string, userId?: string): Promise<CompetitionResponse> {
		return this.formatCompetitionResponse(competitionId, userId)
	}

	/**
	 * 🔍 Поиск соревнования по коду
	 */
	async findCompetitionByCode(code: string) {
		const competition = await this.prisma.competition.findUnique({
			where: { code },
			include: {
				test: { select: { title: true } },
				creator: { select: { name: true } }
			}
		})

		if (!competition) {
			throw new NotFoundException('Competition room not found')
		}

		return {
			id: competition.id,
			code: competition.code,
			title: competition.title,
			status: competition.status,
			testTitle: competition.test.title,
			creatorName: competition.creator.name || 'Unknown',
			canJoin: competition.status === CompetitionStatus.WAITING
		}
	}

	/**
	 * 🏆 Получение таблицы лидеров
	 */
	async getLeaderboard(competitionId: string): Promise<LeaderboardResponse> {
		const competition = await this.prisma.competition.findUnique({
			where: { id: competitionId },
			include: {
				test: { select: { title: true } },
				teams: {
					include: {
						participants: true,
						attempt: {
							include: {
								results: true,
								answers: { include: { question: true } }
							}
						}
					},
					orderBy: { score: 'desc' }
				}
			}
		})

		if (!competition) {
			throw new NotFoundException('Competition not found')
		}

		// Вычисляем позиции команд
		const sortedTeams = competition.teams
			.filter(team => team.attempt)
			.sort((a, b) => {
				// Сначала по очкам
				if (b.score !== a.score) return b.score - a.score

				// Потом по времени завершения
				const aTime = a.attempt?.endTime?.getTime() || Infinity
				const bTime = b.attempt?.endTime?.getTime() || Infinity
				return aTime - bTime
			})

		const leaderboardTeams = sortedTeams.map((team, index) => ({
			position: index + 1,
			team: {
				id: team.id,
				name: team.name,
				color: team.color
			},
			score: team.score,
			participants: team.participants.map(p => ({
				id: p.id,
				displayName: p.displayName,
				isGuest: p.isGuest
			})),
			completionTime: team.attempt?.endTime
				? Math.round((team.attempt.endTime.getTime() - team.attempt.startTime.getTime()) / (60 * 1000))
				: undefined,
			correctAnswers: team.attempt?.answers.filter(a => a.isCorrect).length || 0,
			totalQuestions: team.attempt?.answers.length || 0
		}))

		return {
			competition: {
				id: competition.id,
				title: competition.title,
				testTitle: competition.test.title,
				status: competition.status,
				startedAt: competition.startedAt?.toISOString(),
				endedAt: competition.endedAt?.toISOString()
			},
			teams: leaderboardTeams,
			totalParticipants: competition.teams.reduce((sum, team) => sum + team.participants.length, 0)
		}
	}

	/**
	 * 💬 Отправка сообщения в чат команды (улучшенная версия)
	 */
	async sendTeamMessage(
		competitionId: string,
		teamId: string,
		participantId: string,
		message: string
	): Promise<TeamChatMessage> {
		// Проверяем принадлежность участника к команде
		const participant = await this.prisma.competitionParticipant.findFirst({
			where: {
				id: participantId,
				competitionId,
				teamId
			}
		})

		if (!participant) {
			throw new ForbiddenException('Participant not in this team')
		}

		// Создаем сообщение
		const chatMessage = await this.prisma.teamChatMessage.create({
			data: {
				teamId,
				participantId,
				message
			},
			include: {
				participant: {
					select: { displayName: true }
				}
			}
		})

		// Возвращаем форматированное сообщение
		return {
			id: chatMessage.id,
			participantId: chatMessage.participantId,
			participantName: chatMessage.participant.displayName,
			message: chatMessage.message,
			timestamp: chatMessage.createdAt.toISOString(),
			isOwn: false // будет установлено на фронтенде
		}
	}

	/**
	 * 📝 Получение чата команды с полной информацией (улучшенная версия)
	 */
	async getTeamChatFull(competitionId: string, teamId: string, participantId: string): Promise<TeamChatResponse> {
		// Проверяем принадлежность участника к команде
		const participant = await this.prisma.competitionParticipant.findFirst({
			where: {
				id: participantId,
				competitionId,
				teamId
			},
			include: {
				team: {
					select: { name: true, color: true }
				}
			}
		})

		if (!participant) {
			throw new ForbiddenException('Participant not in this team')
		}

		// Получаем сообщения
		const messages = await this.prisma.teamChatMessage.findMany({
			where: { teamId },
			include: {
				participant: {
					select: { id: true, displayName: true }
				}
			},
			orderBy: { createdAt: 'asc' },
			take: 100
		})

		// Форматируем сообщения
		const formattedMessages: TeamChatMessage[] = messages.map(msg => ({
			id: msg.id,
			participantId: msg.participantId,
			participantName: msg.participant.displayName,
			message: msg.message,
			timestamp: msg.createdAt.toISOString(),
			isOwn: msg.participantId === participantId
		}))

		return {
			teamId,
			teamName: participant.team?.name || 'Unknown Team',
			teamColor: participant.team?.color || '#000000',
			messages: formattedMessages,
			canSendMessages: true
		}
	}

	/**
	 * 📝 Получение истории чата команды
	 */
	async getTeamChat(competitionId: string, teamId: string, participantId: string) {
		// Проверяем принадлежность участника к команде
		const participant = await this.prisma.competitionParticipant.findFirst({
			where: {
				id: participantId,
				competitionId,
				teamId
			}
		})

		if (!participant) {
			throw new ForbiddenException('Participant not in this team')
		}

		return this.prisma.teamChatMessage.findMany({
			where: { teamId },
			include: { participant: { select: { displayName: true } } },
			orderBy: { createdAt: 'asc' },
			take: 100
		})
	}

	// =================== QUIZ METHODS ===================

	/**
	 * 📝 Получение текущего вопроса для участника
	 */
	async getCurrentQuestion(participantId: string) {
		// Находим участника
		const participant = await this.prisma.competitionParticipant.findUnique({
			where: { id: participantId }
		})

		if (!participant?.teamId) {
			throw new BadRequestException('Participant not in a team')
		}

		// Находим команду с попыткой
		const team = await this.prisma.team.findUnique({
			where: { id: participant.teamId },
			include: {
				attempt: {
					include: {
						test: {
							include: {
								questions: true
							}
						},
						answers: true
					}
				}
			}
		})

		if (!team?.attempt) {
			throw new BadRequestException('No active attempt found for this team')
		}

		const attempt = team.attempt
		const answeredQuestionIds = attempt.answers.map(a => a.questionId)

		// Находим следующий неотвеченный вопрос
		const nextQuestion = attempt.test.questions.find(q =>
			!answeredQuestionIds.includes(q.id)
		)

		if (!nextQuestion) {
			return null // Все вопросы отвечены
		}

		return {
			id: nextQuestion.id,
			title: nextQuestion.title,
			type: nextQuestion.type,
			options: nextQuestion.options,
			correctAnswers: nextQuestion.correctAnswers,
			weight: nextQuestion.weight || 1
		}
	}

	/**
	 * ✍️ Отправка ответа на вопрос
	 */
	async submitAnswer(
		participantId: string,
		questionId: string,
		answerData: {
			selectedAnswers?: string[]
			userAnswer?: string
		}
	) {
		// Проверяем участника
		const participant = await this.prisma.competitionParticipant.findUnique({
			where: { id: participantId }
		})

		if (!participant?.teamId) {
			throw new BadRequestException('Participant not in a team')
		}

		// Находим команду с попыткой
		const team = await this.prisma.team.findUnique({
			where: { id: participant.teamId },
			include: {
				attempt: {
					include: {
						test: {
							include: {
								questions: true
							}
						},
						answers: true
					}
				}
			}
		})

		if (!team?.attempt) {
			throw new BadRequestException('No active attempt found')
		}

		// Проверяем, что участник является выбранным игроком команды
		if (team.selectedPlayerId !== participantId) {
			throw new BadRequestException('Only selected player can submit answers')
		}

		const attempt = team.attempt
		const question = attempt.test.questions.find(q => q.id === questionId)

		if (!question) {
			throw new NotFoundException('Question not found')
		}

		// Проверяем, не отвечен ли уже вопрос
		const existingAnswer = attempt.answers.find(a => a.questionId === questionId)
		if (existingAnswer) {
			throw new BadRequestException('Question already answered')
		}

		let isCorrect = false

		// Проверяем правильность ответа
		if (question.type === 'MULTIPLE_CHOICE' && answerData.selectedAnswers) {
			// Сравниваем с массивом правильных ответов
			const sortedSelected = [...answerData.selectedAnswers].sort()
			const sortedCorrect = [...question.correctAnswers].sort()
			isCorrect = JSON.stringify(sortedSelected) === JSON.stringify(sortedCorrect)
		} else if (question.type === 'SHORT_ANSWER' && answerData.userAnswer) {
			// Для коротких ответов проверяем совпадение с любым из правильных ответов
			const userAnswerLower = answerData.userAnswer.toLowerCase().trim()
			isCorrect = question.correctAnswers.some(correct =>
				correct.toLowerCase().trim() === userAnswerLower
			)
		} else if (question.type === 'TRUE_FALSE' && answerData.selectedAnswers?.length === 1) {
			isCorrect = question.correctAnswers.includes(answerData.selectedAnswers[0])
		}

		const score = isCorrect ? (question.weight || 1) : 0

		// Сохраняем ответ
		await this.prisma.attemptAnswer.create({
			data: {
				attemptId: attempt.id,
				questionId,
				selectedAnswers: answerData.selectedAnswers || [],
				userAnswer: answerData.userAnswer || '',
				isCorrect,
				status: 'CHECKED'
			}
		})

		// Обновляем счет команды
		await this.updateTeamScore(team.id)

		// Проверяем, завершен ли тест
		const totalQuestions = attempt.test.questions.length
		const answeredQuestions = attempt.answers.length + 1 // +1 за текущий ответ

		const isTestCompleted = answeredQuestions >= totalQuestions

		if (isTestCompleted) {
			// Завершаем попытку
			await this.prisma.attempt.update({
				where: { id: attempt.id },
				data: {
					status: 'COMPLETED',
					endTime: new Date()
				}
			})

			// Проверяем, завершены ли все команды в соревновании
			await this.checkCompetitionCompletion(participant.competitionId)
		}

		// Находим следующий вопрос
		const nextQuestion = await this.getCurrentQuestion(participantId)

		return {
			isCorrect,
			score,
			nextQuestionId: nextQuestion?.id || null,
			isTestCompleted
		}
	}

	/**
	 * 📊 Получение прогресса команды
	 */
	async getTeamProgress(participantId: string) {
		const participant = await this.prisma.competitionParticipant.findUnique({
			where: { id: participantId }
		})

		if (!participant?.teamId) {
			throw new BadRequestException('Participant not in a team')
		}

		const team = await this.prisma.team.findUnique({
			where: { id: participant.teamId },
			include: {
				attempt: {
					include: {
						test: {
							include: {
								questions: true
							}
						},
						answers: true
					}
				}
			}
		})

		if (!team?.attempt) {
			throw new NotFoundException('Team attempt not found')
		}

		const attempt = team.attempt
		const totalQuestions = attempt.test.questions.length
		const answeredQuestions = attempt.answers.length
		const correctAnswers = attempt.answers.filter(a => a.isCorrect).length
		const totalScore = correctAnswers * 1 // каждый правильный ответ = 1 балл

		return {
			teamId: team.id,
			teamName: team.name,
			totalQuestions,
			answeredQuestions,
			correctAnswers,
			totalScore,
			isCompleted: answeredQuestions >= totalQuestions,
			progress: Math.round((answeredQuestions / totalQuestions) * 100)
		}
	}

	/**
	 * 🔍 Проверка завершения соревнования
	 */
	private async checkCompetitionCompletion(competitionId: string) {
		const competition = await this.prisma.competition.findUnique({
			where: { id: competitionId },
			include: {
				teams: {
					include: {
						attempt: true
					}
				}
			}
		})

		if (!competition) return

		// Проверяем, все ли команды завершили тест
		const teamsWithAttempts = competition.teams.filter(t => t.attempt)
		const completedTeams = teamsWithAttempts.filter(t => t.attempt?.status === 'COMPLETED')

		if (completedTeams.length === teamsWithAttempts.length && teamsWithAttempts.length > 0) {
			// Все команды завершили - завершаем соревнование
			await this.prisma.competition.update({
				where: { id: competitionId },
				data: {
					status: 'COMPLETED',
					endedAt: new Date()
				}
			})
		}
	}

	/**
	 * 🔢 Обновление счета команды
	 */
	private async updateTeamScore(teamId: string) {
		const team = await this.prisma.team.findUnique({
			where: { id: teamId },
			include: {
				attempt: {
					include: {
						answers: true
					}
				}
			}
		})

		if (team?.attempt) {
			const totalScore = team.attempt.answers.filter(a => a.isCorrect).length

			await this.prisma.team.update({
				where: { id: teamId },
				data: { score: totalScore }
			})
		}
	}

	// =================== HELPER METHODS ===================

	/**
	 * Генерация уникального кода комнаты
	 */
	private async generateUniqueCode(): Promise<string> {
		let code: string
		let exists = true

		while (exists) {
			code = Math.random().toString(36).substring(2, 8).toUpperCase()
			const existing = await this.prisma.competition.findUnique({
				where: { code }
			})
			exists = !!existing
		}

		return code!
	}

	/**
	 * Создание команд для соревнования
	 */
	private async createTeams(competitionId: string, maxTeams: number) {
		const teams: any[] = []

		for (let i = 0; i < maxTeams; i++) {
			const team = await this.prisma.team.create({
				data: {
					competitionId,
					name: `Team ${i + 1}`,
					color: this.TEAM_COLORS[i % this.TEAM_COLORS.length]
				}
			})
			teams.push(team)
		}

		return teams
	}

	/**
	 * Форматирование ответа соревнования
	 */
	private async formatCompetitionResponse(competitionId: string, userId?: string): Promise<CompetitionResponse> {
		const competition = await this.prisma.competition.findUnique({
			where: { id: competitionId },
			include: {
				test: { select: { title: true } },
				creator: { select: { name: true } },
				teams: {
					include: {
						participants: true,
						selectedPlayer: true
					}
				},
				participants: {
					include: { team: true }
				}
			}
		})

		if (!competition) {
			throw new NotFoundException('Competition not found')
		}

		const teams: TeamResponse[] = competition.teams.map(team => ({
			id: team.id,
			name: team.name,
			color: team.color,
			participantCount: team.participants.length,
			participants: team.participants.map(p => ({
				id: p.id,
				displayName: p.displayName,
				isGuest: p.isGuest,
				isReady: p.isReady,
				teamName: team.name,
				teamColor: team.color,
				isSelected: team.selectedPlayerId === p.id,
				joinedAt: p.joinedAt.toISOString()
			})),
			selectedPlayer: team.selectedPlayer ? {
				id: team.selectedPlayer.id,
				displayName: team.selectedPlayer.displayName,
				isGuest: team.selectedPlayer.isGuest,
				isReady: team.selectedPlayer.isReady,
				teamName: team.name,
				teamColor: team.color,
				isSelected: true,
				joinedAt: team.selectedPlayer.joinedAt.toISOString()
			} : undefined,
			score: team.score,
			position: team.position
		}))

		const participants: ParticipantResponse[] = competition.participants.map(p => ({
			id: p.id,
			displayName: p.displayName,
			isGuest: p.isGuest,
			isReady: p.isReady,
			teamName: p.team?.name,
			teamColor: p.team?.color,
			isSelected: p.team?.selectedPlayerId === p.id,
			joinedAt: p.joinedAt.toISOString()
		}))

		const userParticipation = userId
			? participants.find(p => p.id === userId)
			: undefined

		// Проверяем возможность старта
		const teamsWithSelectedPlayers = teams.filter(t => t.selectedPlayer && t.participantCount > 0)
		const canStart = competition.status === CompetitionStatus.WAITING &&
			teamsWithSelectedPlayers.length >= 2

		return {
			id: competition.id,
			code: competition.code,
			title: competition.title,
			status: competition.status,
			maxTeams: competition.maxTeams,
			testTitle: competition.test.title,
			creatorName: competition.creator.name || 'Unknown',
			teams,
			participants,
			canStart,
			isCreator: userId === competition.creatorId,
			userParticipation
		}
	}

	/**
	 * 👥 Dashboard для создателя с real-time данными участников
	 */
	async getCreatorDashboard(competitionId: string, creatorId: string): Promise<CreatorDashboardResponse> {
		// Проверяем права создателя
		const competition = await this.prisma.competition.findFirst({
			where: {
				id: competitionId,
				creatorId
			},
			include: {
				test: { select: { title: true } },
				teams: {
					include: {
						participants: {
							include: {
								user: { select: { name: true } }
							}
						}
					}
				},
				participants: {
					include: {
						user: { select: { name: true } },
						team: { select: { id: true, name: true, color: true } }
					},
					orderBy: { joinedAt: 'desc' }
				}
			}
		})

		if (!competition) {
			throw new NotFoundException('Competition not found or access denied')
		}

		// Форматируем команды для dashboard
		const dashboardTeams: CreatorDashboardTeam[] = competition.teams.map(team => {
			const teamParticipants: CreatorDashboardParticipant[] = team.participants.map(participant => ({
				id: participant.id,
				displayName: participant.displayName,
				isGuest: participant.isGuest,
				isOnline: true, // TODO: реализовать отслеживание онлайн статуса
				joinedAt: participant.joinedAt.toISOString(),
				teamInfo: {
					id: team.id,
					name: team.name,
					color: team.color,
					isSelected: team.selectedPlayerId === participant.id
				},
				status: team.selectedPlayerId === participant.id ? 'selected_player' : 'in_team'
			}))

			const selectedPlayer = teamParticipants.find(p => p.status === 'selected_player')

			return {
				id: team.id,
				name: team.name,
				color: team.color,
				participantCount: team.participants.length,
				participants: teamParticipants,
				selectedPlayer,
				hasSelectedPlayer: !!selectedPlayer,
				isReady: !!selectedPlayer && team.participants.length > 0
			}
		})

		// Участники без команды
		const unassignedParticipants: CreatorDashboardParticipant[] = competition.participants
			.filter(p => !p.teamId)
			.map(participant => ({
				id: participant.id,
				displayName: participant.displayName,
				isGuest: participant.isGuest,
				isOnline: true, // TODO: реализовать отслеживание онлайн статуса
				joinedAt: participant.joinedAt.toISOString(),
				status: 'waiting'
			}))

		// Недавняя активность (последние 10 действий)
		const recentActivity = competition.participants
			.slice(0, 10)
			.map(participant => ({
				type: (participant.teamId ? 'team_selected' : 'participant_joined') as 'team_selected' | 'participant_joined' | 'participant_left' | 'player_selected',
				participantName: participant.displayName,
				teamName: participant.team?.name,
				timestamp: participant.joinedAt.toISOString()
			}))

		const totalParticipants = competition.participants.length
		const onlineParticipants = competition.participants.length // TODO: реальный подсчет онлайн

		return {
			competition: {
				id: competition.id,
				code: competition.code,
				title: competition.title,
				status: competition.status,
				testTitle: competition.test.title,
				maxTeams: competition.maxTeams,
				canStart: dashboardTeams.every(team => team.isReady) && totalParticipants >= 2,
				totalParticipants,
				onlineParticipants
			},
			teams: dashboardTeams,
			unassignedParticipants,
			recentActivity
		}
	}

	/**
	 * 📊 Получение статистики участников для создателя
	 */
	async getParticipantsStats(competitionId: string, creatorId: string) {
		const competition = await this.prisma.competition.findFirst({
			where: {
				id: competitionId,
				creatorId
			},
			include: {
				participants: {
					include: {
						team: { select: { name: true, color: true } }
					}
				},
				teams: {
					include: {
						_count: { select: { participants: true } }
					}
				}
			}
		})

		if (!competition) {
			throw new NotFoundException('Competition not found')
		}

		return {
			totalParticipants: competition.participants.length,
			participantsInTeams: competition.participants.filter(p => p.teamId).length,
			participantsWaiting: competition.participants.filter(p => !p.teamId).length,
			guestCount: competition.participants.filter(p => p.isGuest).length,
			registeredCount: competition.participants.filter(p => !p.isGuest).length,
			teamsWithPlayers: competition.teams.filter(t => t._count.participants > 0).length,
			teamsReady: competition.teams.filter(t => t.selectedPlayerId).length
		}
	}
}
