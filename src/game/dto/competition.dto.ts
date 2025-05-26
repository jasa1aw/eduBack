import { CompetitionStatus } from '@prisma/client'
import { Transform } from 'class-transformer'
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

// 🎯 Создание соревнования
export class CreateCompetitionDto {
	@IsString()
	testId: string

	@IsOptional()
	@IsString()
	title?: string

	@IsInt()
	@Min(2)
	@Max(10)
	@Transform(({ value }) => parseInt(value))
	maxTeams: number
}

// 🎮 Подключение к соревнованию
export class JoinCompetitionDto {
	@IsString()
	code: string

	@IsString()
	displayName: string

	@IsOptional()
	@IsString()
	userId?: string
}

// 👥 Выбор команды
export class SelectTeamDto {
	@IsString()
	competitionId: string

	@IsString()
	teamId: string

	@IsString()
	participantId: string
}

// 🎯 Выбор игрока команды
export class SelectPlayerDto {
	@IsString()
	competitionId: string

	@IsString()
	teamId: string

	@IsString()
	participantId: string
}

// 💬 Отправка сообщения в чат команды
export class TeamChatMessageDto {
	@IsString()
	competitionId: string

	@IsString()
	teamId: string

	@IsString()
	message: string

	@IsString()
	participantId: string
}

// 📊 Response interfaces
export interface CompetitionResponse {
	id: string
	code: string
	title: string
	status: CompetitionStatus
	maxTeams: number
	testTitle: string
	creatorName: string
	teams: TeamResponse[]
	participants: ParticipantResponse[]
	canStart: boolean
	isCreator: boolean
	userParticipation?: ParticipantResponse
}

export interface TeamResponse {
	id: string
	name: string
	color: string
	participantCount: number
	participants: ParticipantResponse[]
	selectedPlayer?: ParticipantResponse
	score: number
	position?: number | null
}

export interface ParticipantResponse {
	id: string
	displayName: string
	isGuest: boolean
	isReady: boolean
	teamName?: string
	teamColor?: string
	isSelected: boolean
	joinedAt: string
}

export interface LeaderboardResponse {
	competition: {
		id: string
		title: string
		testTitle: string
		status: CompetitionStatus
		startedAt?: string
		endedAt?: string
	}
	teams: LeaderboardTeam[]
	totalParticipants: number
}

export interface LeaderboardTeam {
	position: number
	team: {
		id: string
		name: string
		color: string
	}
	score: number
	participants: {
		id: string
		displayName: string
		isGuest: boolean
	}[]
	completionTime?: number
	correctAnswers: number
	totalQuestions: number
}

export interface ChatMessage {
	id: string
	participantName: string
	message: string
	timestamp: string
	isOwn: boolean
}

// 📝 DTO для отправки ответа
export class SubmitAnswerDto {
	@IsString()
	participantId: string

	@IsString()
	questionId: string

	@IsOptional()
	selectedAnswers?: string[]

	@IsOptional()
	@IsString()
	userAnswer?: string
}

// 🎯 Интерфейсы для тестирования
export interface QuestionResponse {
	id: string
	number: number
	title: string
	type: string
	options?: string[]
	hasImage: boolean
	imageUrl?: string
	weight: number
	totalQuestions: number
	answeredCount: number
}

export interface AnswerResult {
	success: boolean
	isCorrect?: boolean
	nextQuestionId?: string
	isTestCompleted: boolean
	currentScore?: number
	message: string
}

export interface TeamProgress {
	totalQuestions: number
	answeredCount: number
	correctCount: number
	timeElapsed: number
	currentScore: number
	isCompleted: boolean
	canAnswer: boolean
	isObserver: boolean
} 