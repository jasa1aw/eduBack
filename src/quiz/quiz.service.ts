import { PrismaService } from '@/prisma/prisma.service'
import {
  AddQuestionDto,
  CreateTestDto,
  UpdateQuestionDto,
  UpdateTestDto,
} from '@/src/dto/quiz.dto'
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { AnswerStatus, AttemptStatus, QuestionType } from '@prisma/client'

import { Response } from 'express'
import * as fs from 'fs'
import * as path from 'path'
import * as PDFDocument from 'pdfkit'

// Interface for detailed test results
export interface DetailedTestResult {
  questionId: string
  questionTitle: string
  questionType: QuestionType
  options: string[]
  correctAnswers: string[]
  userSelectedAnswers: string[]
  userAnswer: string | null
  isCorrect: boolean | null
  explanation: string | null
}

// Interface for practice test submission response
export interface PracticeTestResponse {
  message: string
  score: number
  totalQuestions: number
  correctAnswers: number
  incorrectAnswers: number
  detailedResults: DetailedTestResult[]
  showAnswers: true
}

// Interface for exam test submission response
export interface ExamTestResponse {
  message: string
  score: number
  status: AttemptStatus
  timeElapsed: number
  timeLimit: number
  showAnswers: boolean
  detailedResults: DetailedTestResult[] | null
}

// Interface for practice test results response
export interface PracticeTestResultsResponse {
  testTitle: string
  score: number
  totalQuestions: number
  correctAnswers: number
  incorrectAnswers: number
  showAnswers: true
  mode: 'PRACTICE'
  results: DetailedTestResult[]
}

// Interface for exam test results response
export interface ExamTestResultsResponse {
  testTitle: string
  score: number
  status: AttemptStatus
  showAnswers: boolean
  mode: 'EXAM'
  totalQuestions: number
  correctAnswers: number
  incorrectAnswers: number
  results?: DetailedTestResult[]
}

// Interface for single answer submission
export interface SingleAnswerRequest {
  questionId: string
  selectedAnswers?: string[]
  userAnswer?: string
}

// Interface for single answer response
export interface SingleAnswerResponse {
  success: boolean
  message: string
  isCorrect?: boolean
  questionId: string
  nextQuestionId?: string
  nextQuestion?: {
    id: string
    title: string
    type: QuestionType
    options: string[]
    explanation?: string
    weight: number
  }
}

// Interface for resume session response
export interface ResumeResponse {
  attemptId: string
  mode: 'practice' | 'exam'
  answered: AnsweredQuestion[]
  question: QuestionData | null
  resumeTargetQuestionId: string | null
  isCompleted: boolean
  currentAnswer?: AnsweredQuestion | null
}

// Interface for answered question data
export interface AnsweredQuestion {
  questionId: string
  selectedAnswers?: string[]
  userAnswer?: string
  isCorrect?: boolean
  timestamp: Date
}

// Interface for question data
export interface QuestionData {
  id: string
  title: string
  type: QuestionType
  options: string[]
  explanation?: string
  weight: number
}

// Interface for question with answers
export interface QuestionWithAnswers {
  id: string
  title: string
  type: QuestionType
  options: string[]
  weight: number
  selectedAnswers?: string[]
  userAnswer?: string
}

@Injectable()
export class QuizService {
	private readonly uploadDir = 'uploads/questions'

	constructor(private prisma: PrismaService) {
		// Создаем директорию для загрузки, если она не существует
		if (!fs.existsSync(this.uploadDir)) {
			fs.mkdirSync(this.uploadDir, { recursive: true })
		}
	}

	// Helper method to process an answer and determine if it's correct
	private processAnswer(question: any, selectedAnswers?: string[], userAnswer?: string): boolean | null {
		if (!question) return false

		switch (question.type) {
			case 'MULTIPLE_CHOICE':
				const sortedSelected = (selectedAnswers || []).slice().sort()
				const sortedCorrect = question.correctAnswers.slice().sort()
				return sortedSelected.length === sortedCorrect.length &&
					sortedSelected.every((v, i) => v === sortedCorrect[i])

			case 'SHORT_ANSWER':
				const normalizedSelected = userAnswer?.trim().toLowerCase() || ''
				const normalizedCorrect = question.correctAnswers.map(a => a.trim().toLowerCase())
				return normalizedCorrect.includes(normalizedSelected)

			case 'TRUE_FALSE':
				return selectedAnswers?.[0]?.toLowerCase() === question.correctAnswers[0]?.toLowerCase()

			case 'OPEN_QUESTION':
				return null // Requires manual checking

			default:
				return false
		}
	}

	// Helper method to calculate score for an attempt
	private async calculateScore(attemptId: string): Promise<number> {
		const answers = await this.prisma.attemptAnswer.findMany({
			where: { attemptId },
			select: { isCorrect: true, question: { select: { weight: true } } },
		})

		const totalWeight = answers.reduce((sum, a) => sum + (a.question.weight || 1), 0)
		const correctWeight = answers
			.filter(a => a.isCorrect)
			.reduce((sum, a) => sum + (a.question.weight || 1), 0)

		return totalWeight > 0 ? Math.round((correctWeight / totalWeight) * 100) : 0
	}

	async findAllByUser(userId: string) {

		if (!userId) throw new ForbiddenException('Unauthorized user')
		// console.log(userId)
		const tests = await this.prisma.test.findMany({
			where: { creatorId: userId },
			include: { questions: true },
		})

		return tests
	}

	async findOne(id: string) {
		const test = await this.prisma.test.findUnique({
			where: { id },
			include: { questions: true },
		})

		if (!test) throw new NotFoundException('Test not found')
		return test
	}
	async findPublishedByUser(userId: string) {
		if (!userId) throw new ForbiddenException('Unauthorized user')
	
		const tests = await this.prisma.test.findMany({
		  where: {
			creatorId: userId,
			isDraft: false,
		  },
		  include: { questions: true },
		})
	
		return tests
	  }
	async createTest(userId: string, dto: CreateTestDto) {
		if (!userId) throw new ForbiddenException('Unauthorized user')

		return this.prisma.test.create({
			data: {
				title: dto.title,
				creatorId: userId,
				isDraft: dto.isDraft ?? true,
				maxAttempts: dto.maxAttempts ?? 1,
				showAnswers: dto.showAnswers ?? false,
				timeLimit: typeof dto.timeLimit === 'string' ? parseInt(dto.timeLimit) || 10 : dto.timeLimit || 10,
				examMode: dto.examMode ?? false,
			},
			include: {
				questions: true
			}
		})
	}

	async addQuestion(testId: string, userId: string, dto: AddQuestionDto, image?: Express.Multer.File) {
		const test = await this.prisma.test.findUnique({
			where: { id: testId },
			select: { creatorId: true }
		})
		if (!test) throw new NotFoundException('Test not found')
		if (test.creatorId !== userId) throw new ForbiddenException('Not allowed to add questions to this test')
		let imagePath: string | null = null
		if (image) {
			imagePath = image.path
		}
		const questionData = {
			testId,
			title: dto.title,
			type: dto.type,
			options: dto.options ?? [],
			correctAnswers: dto.correctAnswers ?? [],
			explanation: dto.explanation,
			image: imagePath,
			weight: typeof dto.weight === 'string' ? parseInt(dto.weight) || 1 : dto.weight || 1,
		}
		return this.prisma.question.create({
			data: questionData
		})
	}

	async updateTest(testId: string, userId: string, dto: UpdateTestDto) {
		const test = await this.prisma.test.findUnique({
			where: { id: testId },
			select: { creatorId: true }
		})

		if (!test) throw new NotFoundException('Test not found')
		if (test.creatorId !== userId) throw new ForbiddenException('Not allowed to edit this test')

		// Only update test properties, not questions
		return this.prisma.test.update({
			where: { id: testId },
			data: dto
		})
	}

	async updateQuestion(questionId: string, userId: string, questionData: UpdateQuestionDto, image?: Express.Multer.File) {
		// First find the question and its test to check permissions
		const question = await this.prisma.question.findUnique({
			where: { id: questionId },
			select: {
				testId: true,
				test: { select: { creatorId: true } }
			}
		})

		if (!question) throw new NotFoundException('Question not found')
		if (question.test.creatorId !== userId) throw new ForbiddenException('Not allowed to edit this question')

		// Prepare update data with type conversion for weight and image handling
		const updateData = {
			...questionData,
			...(questionData.weight && {
				weight: typeof questionData.weight === 'string' ? parseInt(questionData.weight) || 50 : questionData.weight
			}),
			...(image && { image: image.path })
		}

		return this.prisma.question.update({
			where: { id: questionId },
			data: updateData
		})
	}

	async deleteTest(id: string, userId: string) {
		const test = await this.prisma.test.findUnique({
			where: { id: id },
			select: { creatorId: true }
		})

		if (!test) throw new NotFoundException('Test not found')
		if (test.creatorId !== userId) throw new ForbiddenException('Not allowed to edit this test')

		// Удаляем тест (каскадное удаление удалит связанные вопросы, попытки и результаты)
		await this.prisma.test.delete({
			where: { id }
		})

		return {
			message: 'Тест успешно удален',
			status: 'success'
		}
	}

	async deleteQuestion(questionId: string, userId: string) {
		const question = await this.prisma.question.findUnique({
			where: { id: questionId },
			select: {
				testId: true,
				test: { select: { creatorId: true } }
			}
		})

		if (!question) throw new NotFoundException('Question not found')
		if (question.test.creatorId !== userId) throw new ForbiddenException('Not allowed to edit this question')

		// Удаляем вопрос
		await this.prisma.question.delete({
			where: { id: questionId }
		})

		return {
			message: 'Вопрос успешно удален',
			status: 'success'
		}
	}

	async startPracticeTest(userId: string, testId: string) {
		const test = await this.prisma.test.findUnique({
			where: { id: testId },
			include: { questions: true }
		})

		if (!test) throw new NotFoundException('Test not found')

		const attempt = await this.prisma.attempt.create({
			data: {
				userId,
				testId,
				startTime: new Date(),
				status: 'IN_PROGRESS',
			},
		})

		// Получаем первый вопрос (сортируем для консистентности)
		const firstQuestion = test.questions.sort((a, b) => a.id.localeCompare(b.id))[0]

		return {
			attemptId: attempt.id,
			mode: 'PRACTICE',
			firstQuestionId: firstQuestion?.id || null
		}
	}

	async startExamTest(userId: string, testId: string) {
		const test = await this.prisma.test.findUnique({
			where: { id: testId },
			include: { questions: true },
		})

		if (!test) throw new NotFoundException('Test not found')

		// Check if test is configured for exam mode
		if (!test.examMode) {
			throw new ForbiddenException('This test is not configured for exam mode')
		}

		// Check if user has reached max attempts in exam mode
		const attemptCount = await this.prisma.attempt.count({
			where: {
				userId,
				testId,
				status: { in: ['COMPLETED', 'TIMEOUT'] }
			}
		})

		if (test.maxAttempts && attemptCount >= test.maxAttempts) {
			throw new ForbiddenException('Maximum attempts reached for this test')
		}

		const attempt = await this.prisma.attempt.create({
			data: {
				userId,
				testId,
				startTime: new Date(),
				status: 'IN_PROGRESS',
			},
		})

		// Получаем первый вопрос (сортируем для консистентности)
		const firstQuestion = test.questions.sort((a, b) => a.id.localeCompare(b.id))[0]

		return {
			attemptId: attempt.id,
			mode: 'EXAM',
			firstQuestionId: firstQuestion?.id || null,
			timeLimit: test.timeLimit
		}
	}

	async getQuestion(userId: string, attemptId: string, questionId: string) {
		const attempt = await this.prisma.attempt.findUnique({
			where: { id: attemptId, userId },
			include: {
				test: {
					include: {
						questions: true
					}
				}
			}
		})

		if (!attempt) {
			throw new NotFoundException('Attempt not found')
		}

		if (attempt.status !== AttemptStatus.IN_PROGRESS) {
			throw new ForbiddenException('This test attempt is already completed')
		}

		const question = attempt.test.questions.find(q => q.id === questionId)
		if (!question) {
			throw new NotFoundException('Question not found in this test')
		}

		return {
			id: question.id,
			title: question.title,
			image: question.image || undefined,
			type: question.type,
			options: question.options,
			explanation: question.explanation || undefined,
			weight: question.weight || 1
		}
	}

	async saveProgress(
		userId: string,
		attemptId: string,
		answer: { questionId: string; selectedAnswers?: string[]; userAnswer?: string }
	) {
		// Валидация входных данных
		console.log('saveProgress called with:', { userId, attemptId, answer })

		if (!answer || !answer.questionId) {
			throw new Error('Question ID is required')
		}

		if (!attemptId) {
			throw new Error('Attempt ID is required')
		}

		const attempt = await this.prisma.attempt.findUnique({
			where: { id: attemptId },
			select: {
				id: true,
				userId: true,
				testId: true,
				status: true
			}
		})

		if (!attempt) throw new NotFoundException('Attempt not found')
		if (attempt.status !== AttemptStatus.IN_PROGRESS) {
			throw new ForbiddenException('This test attempt is already completed')
		}

		// Проверяем, что вопрос принадлежит этому тесту
		const question = await this.prisma.question.findFirst({
			where: {
				id: answer.questionId,
				testId: attempt.testId
			}
		})

		if (!question) {
			throw new NotFoundException('Question not found in this test')
		}

		// Сохраняем или обновляем ответ
		const existingAnswer = await this.prisma.attemptAnswer.findFirst({
			where: {
				attemptId,
				questionId: answer.questionId
			}
		})

		const answerData = {
			attemptId,
			questionId: answer.questionId,
			selectedAnswers: answer.selectedAnswers || [],
			userAnswer: answer.userAnswer || undefined,
			isCorrect: null, // Не проверяем правильность сейчас
			status: AnswerStatus.PENDING
		}

		console.log('answerData before save:', answerData)

		if (existingAnswer) {
			await this.prisma.attemptAnswer.update({
				where: { id: existingAnswer.id },
				data: answerData
			})
		} else {
			await this.prisma.attemptAnswer.create({
				data: answerData
			})
		}

		// Находим следующий неотвеченный вопрос
		const answeredQuestions = await this.prisma.attemptAnswer.findMany({
			where: { attemptId },
			select: { questionId: true }
		})

		const answeredIds = answeredQuestions.map(aq => aq.questionId)

		// Получаем все вопросы теста и находим следующий неотвеченный
		const allQuestions = await this.prisma.question.findMany({
			where: { testId: attempt.testId },
			select: { id: true },
			orderBy: { id: 'asc' }
		})

		const nextQuestion = allQuestions.find(q => !answeredIds.includes(q.id))

		return {
			success: true,
			message: 'Progress saved successfully',
			nextQuestionId: nextQuestion?.id || null,
			isCompleted: !nextQuestion
		}
	}

	async getQuestionsAttempt(attemptId: string) {
		const attempt = await this.prisma.attempt.findUnique({
			where: { id: attemptId },
			include: { test: { include: { questions: true } } }
		})

		if (!attempt) throw new NotFoundException('Attempt not found')

		return attempt.test.questions
	}

	async resumeAttempt(userId: string, attemptId: string, questionId: string) {
		const attempt = await this.prisma.attempt.findUnique({
			where: { id: attemptId, userId },
			include: { test: { include: { questions: true } } }
		})

		if (!attempt) throw new NotFoundException('Attempt not found')

		if (attempt.status !== AttemptStatus.IN_PROGRESS) {
			throw new ForbiddenException('This test attempt is already completed')
		}

		// Ищем существующий ответ в AttemptAnswer
		const exQuestion = await this.prisma.attemptAnswer.findFirst({
			where: {
				attemptId,
				questionId
			},
			select: {
				question: {
					select: {
						id: true,
						title: true,
						type: true,
						options: true,
						weight: true
					}
				},
				selectedAnswers: true,
				userAnswer: true
			}
		})

		// Если нет ответа, ищем вопрос в тесте
		let question
		if (exQuestion) {
			question = exQuestion.question
		} else {
			question = attempt.test.questions.find(q => q.id === questionId)
			if (!question) throw new NotFoundException('Question not found in this test')
		}

		// Формируем ответ
		const response: QuestionWithAnswers = {
			id: question.id,
			title: question.title,
			type: question.type,
			options: question.options,
			weight: question.weight || 1
		}

		// Добавляем ответы только если они есть
		if (exQuestion) {
			if (exQuestion.selectedAnswers && exQuestion.selectedAnswers.length > 0) {
				response.selectedAnswers = exQuestion.selectedAnswers
			}
			if (exQuestion.userAnswer && exQuestion.userAnswer.trim().length > 0) {
				response.userAnswer = exQuestion.userAnswer
			}
		}

		return response
	}

	async submitPracticeTest(
		userId: string,
		attemptId: string
	): Promise<PracticeTestResponse> {
		if (!userId || !attemptId) {
			throw new Error('Invalid input data')
		}

		const attempt = await this.prisma.attempt.findUnique({
			where: { id: attemptId, userId },
		})

		if (!attempt) {
			throw new NotFoundException('Attempt not found or unauthorized')
		}

		if (attempt.status !== AttemptStatus.IN_PROGRESS) {
			throw new ForbiddenException('This test attempt is already completed')
		}

		// Получаем все вопросы теста
		const questions = await this.prisma.question.findMany({
			where: { testId: attempt.testId },
			select: { id: true, type: true, correctAnswers: true, weight: true, title: true, options: true, explanation: true }
		})

		// Получаем все ответы пользователя из AttemptAnswer
		const existingAnswers = await this.prisma.attemptAnswer.findMany({
			where: { attemptId },
			select: { questionId: true, selectedAnswers: true, userAnswer: true }
		})

		// Process answers for practice mode - show all answers and explanations
		const attemptAnswers = existingAnswers.map(({ questionId, selectedAnswers, userAnswer }) => {
			const question = questions.find(q => q.id === questionId)
			const isCorrect = this.processAnswer(question, selectedAnswers, userAnswer || undefined)

			return {
				attemptId,
				questionId,
				selectedAnswers: selectedAnswers || [],
				userAnswer: userAnswer || undefined,
				isCorrect,
				status: question?.type === 'OPEN_QUESTION' ? AnswerStatus.PENDING : AnswerStatus.CHECKED
			}
		})

		// Обновляем существующие ответы с результатами проверки
		for (const answer of attemptAnswers) {
			await this.prisma.attemptAnswer.updateMany({
				where: {
					attemptId,
					questionId: answer.questionId
				},
				data: {
					isCorrect: answer.isCorrect,
					status: answer.status
				}
			})
		}

		// Calculate score
		const totalQuestions = questions.length
		const correctAnswers = attemptAnswers.filter(a => a.isCorrect === true).length
		const score = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0

		await this.prisma.$transaction([
			this.prisma.attempt.update({
				where: { id: attemptId, userId },
				data: { status: AttemptStatus.COMPLETED, endTime: new Date() }
			}),
			this.prisma.result.create({
				data: { attemptId, userId, testId: attempt.testId, score }
			})
		])

		// Return detailed results for practice mode
		const detailedResults: DetailedTestResult[] = questions.map(question => {
			const userAnswer = attemptAnswers.find(a => a.questionId === question.id)
			return {
				questionId: question.id,
				questionTitle: question.title,
				questionType: question.type,
				options: question.options,
				correctAnswers: question.correctAnswers,
				userSelectedAnswers: userAnswer?.selectedAnswers || [],
				userAnswer: userAnswer?.userAnswer || null,
				isCorrect: userAnswer?.isCorrect || null,
				explanation: question.explanation
			}
		})

		return {
			message: 'Practice test completed successfully',
			score,
			totalQuestions,
			correctAnswers,
			incorrectAnswers: totalQuestions - correctAnswers,
			detailedResults,
			showAnswers: true
		}
	}

	async submitExamTest(
		userId: string,
		attemptId: string
	): Promise<ExamTestResponse> {
		if (!userId || !attemptId) {
			throw new Error('Invalid input data')
		}

		const attempt = await this.prisma.attempt.findUnique({
			where: { id: attemptId, userId },
			include: {
				test: { select: { timeLimit: true, showAnswers: true } }
			}
		})

		if (!attempt) {
			throw new NotFoundException('Attempt not found or unauthorized')
		}

		if (attempt.status !== AttemptStatus.IN_PROGRESS) {
			throw new ForbiddenException('This test attempt is already completed')
		}

		// Check if the test was submitted within time limits
		const now = new Date()
		const startTime = new Date(attempt.startTime)
		const questions = await this.prisma.question.findMany({
			where: { testId: attempt.testId },
			select: { id: true, type: true, correctAnswers: true, weight: true, title: true, options: true, explanation: true }
		})

		const totalTimeLimit = attempt.test.timeLimit
		const elapsedMinutes = (now.getTime() - startTime.getTime()) / (60 * 1000)

		// Set timeout status if over time limit
		const attemptStatus = elapsedMinutes > totalTimeLimit ? AttemptStatus.TIMEOUT : AttemptStatus.COMPLETED

		// Получаем все ответы пользователя из AttemptAnswer
		const existingAnswers = await this.prisma.attemptAnswer.findMany({
			where: { attemptId },
			select: { questionId: true, selectedAnswers: true, userAnswer: true }
		})

		// Process answers
		const attemptAnswers = existingAnswers.map(({ questionId, selectedAnswers, userAnswer }) => {
			const question = questions.find(q => q.id === questionId)
			const isCorrect = this.processAnswer(question, selectedAnswers, userAnswer || undefined)

			return {
				attemptId,
				questionId,
				selectedAnswers: selectedAnswers || [],
				userAnswer: userAnswer || undefined,
				isCorrect,
				status: question?.type === 'OPEN_QUESTION' ? AnswerStatus.PENDING : AnswerStatus.CHECKED
			}
		})

		// Обновляем существующие ответы с результатами проверки
		for (const answer of attemptAnswers) {
			await this.prisma.attemptAnswer.updateMany({
				where: {
					attemptId,
					questionId: answer.questionId
				},
				data: {
					isCorrect: answer.isCorrect,
					status: answer.status
				}
			})
		}

		// Calculate weighted score for exam mode
		const totalWeight = questions.reduce((sum, q) => sum + (q.weight || 1), 0)
		const weightedScore = attemptAnswers
			.filter(a => a.isCorrect === true)
			.reduce((sum, a) => {
				const question = questions.find(q => q.id === a.questionId)
				return sum + (question?.weight || 1)
			}, 0)
		const score = totalWeight > 0 ? Math.round((weightedScore / totalWeight) * 100) : 0

		// Apply penalty for timeout if needed
		const finalScore = attemptStatus === AttemptStatus.TIMEOUT ? Math.max(0, score - 10) : score

		await this.prisma.$transaction([
			this.prisma.attempt.update({
				where: { id: attemptId, userId },
				data: { status: attemptStatus, endTime: now }
			}),
			this.prisma.result.create({
				data: { attemptId, userId, testId: attempt.testId, score: finalScore }
			})
		])

		// Return limited results for exam mode (based on showAnswers setting)
		const detailedResults: DetailedTestResult[] | null = attempt.test.showAnswers
			? questions.map(question => {
				const userAnswer = attemptAnswers.find(a => a.questionId === question.id)
				return {
					questionId: question.id,
					questionTitle: question.title,
					questionType: question.type,
					options: question.options,
					correctAnswers: question.correctAnswers,
					userSelectedAnswers: userAnswer?.selectedAnswers || [],
					userAnswer: userAnswer?.userAnswer || null,
					isCorrect: userAnswer?.isCorrect || null,
					explanation: question.explanation
				}
			})
			: null

		return {
			message: 'Exam submitted successfully',
			score: finalScore,
			status: attemptStatus,
			timeElapsed: Math.round(elapsedMinutes),
			timeLimit: totalTimeLimit,
			showAnswers: attempt.test.showAnswers,
			detailedResults
		}
	}

	async getPendingAnswers(teacherId: string) {
		const tests = await this.prisma.test.findMany({
			where: { creatorId: teacherId },
			select: { id: true },
		})

		const testIds = tests.map(t => t.id)

		return this.prisma.attemptAnswer.findMany({
			where: {
				question: { testId: { in: testIds }, type: 'OPEN_QUESTION' },
				status: 'PENDING',
			},
			select: {
				id: true,
				attemptId: true,
				questionId: true,
				userAnswer: true, // ✅ Добавляем поле userAnswer вместо selectedAnswers
				question: {
					select: { title: true },
				},
			},
		})
	}

	async recalculateAttemptScore(attemptId: string) {
		const attempt = await this.prisma.attempt.findUnique({
			where: { id: attemptId },
			select: { testId: true },
		})

		if (!attempt) throw new NotFoundException('Попытка не найдена')

		// Use the helper method to calculate the score
		const newScore = await this.calculateScore(attemptId)

		// Find the result record
		const result = await this.prisma.result.findFirst({
			where: { attemptId },
			select: { id: true },
		})

		if (!result) throw new NotFoundException('Результат не найден')

		return this.prisma.result.update({
			where: { id: result.id },
			data: { score: newScore },
		})
	}

	async reviewAnswer(teacherId: string, answerId: string, isCorrect: boolean) {
		const answer = await this.prisma.attemptAnswer.findUnique({
			where: { id: answerId },
			select: {
				id: true,
				attemptId: true,
				questionId: true,
				question: { select: { testId: true, weight: true, test: { select: { creatorId: true } } } },
			},
		})

		if (!answer) throw new NotFoundException('Ответ не найден')
		if (answer.question.test.creatorId !== teacherId)
			throw new ForbiddenException('Вы не можете оценивать этот ответ')

		await this.prisma.attemptAnswer.update({
			where: { id: answerId },
			data: {
				isCorrect,
				status: AnswerStatus.CHECKED,
			},
		})

		return this.recalculateAttemptScore(answer.attemptId)
	}

	async getTestResults(attemptId: string) {
		const attempt = await this.prisma.attempt.findUnique({
			where: { id: attemptId },
			include: {
				test: { select: { title: true, showAnswers: true, examMode: true } },
				results: { select: { score: true } }
			}
		})

		if (!attempt) {
			throw new NotFoundException('Attempt not found')
		}

		const mode = attempt.test.examMode ? 'EXAM' : 'PRACTICE'
		const showAnswers = attempt.test.examMode ? attempt.test.showAnswers : true
		const score = attempt.results[0]?.score || 0

		const baseResult = {
			testTitle: attempt.test.title,
			score,
			showAnswers,
			mode,
			...(attempt.test.examMode && { status: attempt.status })
		}

		// Return detailed results if showAnswers is enabled
		if (showAnswers) {
			const results = await this.prisma.attemptAnswer.findMany({
				where: { attemptId },
				select: {
					questionId: true,
					selectedAnswers: true,
					userAnswer: true,
					isCorrect: true,
					question: {
						select: {
							correctAnswers: true,
							type: true,
							title: true,
							options: true,
							explanation: true,
							weight: true
						},
					},
				},
			})

			const totalQuestions = results.length
			const correctAnswers = results.filter(r => r.isCorrect === true).length

			const mappedResults: DetailedTestResult[] = results.map(r => ({
				questionId: r.questionId,
				questionTitle: r.question.title,
				questionType: r.question.type,
				options: r.question.options,
				correctAnswers: r.question.correctAnswers,
				userSelectedAnswers: r.selectedAnswers,
				userAnswer: r.question.type === 'SHORT_ANSWER' || r.question.type === 'OPEN_QUESTION' ? r.userAnswer : null,
				isCorrect: r.question.type === 'OPEN_QUESTION' && attempt.test.examMode ? null : r.isCorrect,
				explanation: r.question.explanation
			}))

			return {
				...baseResult,
				...(mode === 'PRACTICE' && {
					totalQuestions,
					correctAnswers,
					incorrectAnswers: totalQuestions - correctAnswers
				}),
				results: mappedResults
			}
		}

		return baseResult
	}

	async getPracticeTestResults(attemptId: string): Promise<PracticeTestResultsResponse> {
		return this.getTestResults(attemptId) as Promise<PracticeTestResultsResponse>
	}

	async getExamTestResults(attemptId: string): Promise<ExamTestResultsResponse> {
		return this.getTestResults(attemptId) as Promise<ExamTestResultsResponse>
	}

	async exportCompletedTestToPDF(attemptId: string, res: Response) {
		// Получаем данные о попытке, тесте и ответах
		const attempt = await this.prisma.attempt.findUnique({
			where: { id: attemptId },
			include:
			{
				test: { include: { questions: true } },
				answers: { include: { question: true } },
				user: { select: { name: true, email: true } },
				results: { select: { score: true } }
			}
		})

		if (!attempt) {
			throw new NotFoundException('Попытка теста не найдена')
		}

		const doc = new PDFDocument()
		res.setHeader('Content-Type', 'application/pdf')
		res.setHeader('Content-Disposition', `attachment; filename=test-results-${attempt.id}.pdf`)
		doc.pipe(res)

		// Загружаем шрифт для поддержки кириллицы
		const fontPath = path.join(process.cwd(), 'src/utils/fonts/Arial.ttf')
		doc.font(fontPath)

		// Заголовок и информация о тесте
		doc.fontSize(20).text(`Результаты теста: ${attempt.test.title}`, { align: 'center' })
		doc.moveDown()
		doc.fontSize(12)
			.text(`Студент: ${attempt.user.name}`)
			.text(`Email: ${attempt.user.email}`)
			.text(`Дата: ${attempt.endTime ? new Date(attempt.endTime).toLocaleString() : 'Не завершен'}`)
			.text(`Итоговый балл: ${attempt.results[0]?.score || 0}%`)
			.moveDown(2)

		// Обход всех вопросов и ответов
		attempt.answers.forEach((answer, index) => {
			// Вопрос
			doc.fontSize(14)
				.fillColor('black')
				.text(`${index + 1}. ${answer.question.title}`, { underline: true })
			doc.moveDown(0.5)

			// Обработка разных типов вопросов
			switch (answer.question.type) {
				case 'MULTIPLE_CHOICE':
					// Варианты ответов
					doc.fontSize(12)
						.fillColor('black')
						.text('Варианты ответов:')
					answer.question.options.forEach((option, optIndex) => {
						doc.text(`${String.fromCharCode(65 + optIndex)}) ${option}`)
					})
					doc.moveDown(0.5)
						.fillColor('green')
						.text('Правильные ответы:')
					answer.question.correctAnswers.forEach((correctAnswer) => {
						const optionIndex = answer.question.options.indexOf(correctAnswer)
						if (optionIndex !== -1) {
							doc.text(`Правильный ответ: ${String.fromCharCode(65 + optionIndex)}) ${correctAnswer}`)
						}
					})
					break

				case 'SHORT_ANSWER':
					doc.fontSize(12)
						.fillColor('blue')
						.text(`Ответ студента: ${answer.userAnswer || 'Нет ответа'}`)
						.fillColor('green')
						.text(`Правильный ответ: ${answer.question.correctAnswers.join(' или ')}`)
					break

				case 'TRUE_FALSE':
					doc.fontSize(12)
						.fillColor('blue')
						.text(`Ответ студента: ${answer.selectedAnswers[0] || 'Нет ответа'}`)
						.fillColor('green')
						.text(`Правильный ответ: ${answer.question.correctAnswers[0]}`)
					break

				case 'OPEN_QUESTION':
					doc.fontSize(12)
						.fillColor('blue')
						.text(`Ответ студента: ${answer.userAnswer || 'Нет ответа'}`)
						.fillColor('gray')
						.text(`Статус: ${answer.status === 'CHECKED'
							? (answer.isCorrect ? '✓ Верно' : '✗ Неверно')
							: 'Ожидает проверки'
							}`)
					break
			}

			// Вес вопроса и полученные баллы
			doc.moveDown(0.5)
				.fontSize(10)
				.fillColor('gray')
				.text(`Вес вопроса: ${answer.question.weight || 1} балл(ов)`)

			if (answer.question.type !== 'OPEN_QUESTION' || answer.status === 'CHECKED') {
				doc.text(`Получено баллов: ${answer.isCorrect ? (answer.question.weight || 1) : 0}`)
			}

			// Если есть пояснение к вопросу
			if (answer.question.explanation) {
				doc.moveDown(0.5)
					.fillColor('gray')
					.text('Пояснение:', { underline: true })
					.text(answer.question.explanation)
			}

			doc.moveDown(2)
		})

		// Итоговая статистика
		doc.fontSize(14)
			.fillColor('black')
			.text('Итоговая статистика:', { underline: true })

		const totalQuestions = attempt.answers.length
		const correctAnswers = attempt.answers.filter(a => a.isCorrect).length
		const pendingAnswers = attempt.answers.filter(a => a.question.type === 'OPEN_QUESTION' && a.status !== 'CHECKED').length

		doc.fontSize(12)
			.text(`Всего вопросов: ${totalQuestions}`)
			.text(`Правильных ответов: ${correctAnswers}`)
			.text(`Ожидают проверки: ${pendingAnswers}`)
			.text(`Итоговый балл: ${attempt.results[0]?.score || 0}%`)

		doc.end()
	}

	async exportTestToPDF(testId: string, res: Response) {
		const test = await this.prisma.test.findUnique({
			where: { id: testId },
			include: { questions: true },
		})

		if (!test) {
			throw new NotFoundException('Тест не найден')
		}

		const doc = new PDFDocument()
		res.setHeader('Content-Type', 'application/pdf')
		res.setHeader('Content-Disposition', `attachment; filename=test-${test.id}.pdf`)
		doc.pipe(res)

		// ✅ Указываем путь к шрифту (чтобы корректно отображалась кириллица)
		const fontPath = path.join(process.cwd(), 'src/utils/fonts/Arial.ttf')
		doc.font(fontPath)

		// ✅ Заголовок теста
		doc.fontSize(20).text(`Тест: ${test.title}`, { align: 'center' })
		doc.moveDown(2)

		// ✅ Обход всех вопросов
		test.questions.forEach((question, index) => {
			// ✅ Вопрос
			doc.fontSize(14).text(`${index + 1}. ${question.title}`, { underline: true })
			doc.moveDown(0.5)

			// ✅ Варианты ответа (A, B, C, ...)
			question.options.forEach((option, optIndex) => {
				doc.fontSize(12).text(`${String.fromCharCode(65 + optIndex)}) ${option}`)
			})

			doc.moveDown(1)
		})

		doc.end()
		return doc
	}

	async exportTestWithAnswersToPDF(testId: string, res: Response) {
		const test = await this.prisma.test.findUnique({
			where: { id: testId },
			include: { questions: true },
		})

		if (!test) {
			throw new NotFoundException('Тест не найден')
		}

		const doc = new PDFDocument()
		res.setHeader('Content-Type', 'application/pdf')
		res.setHeader('Content-Disposition', `attachment; filename=test-with-answers-${test.id}.pdf`)
		doc.pipe(res)

		// Загружаем шрифт для кириллицы
		const fontPath = path.join(process.cwd(), 'src/utils/fonts/Arial.ttf')
		doc.font(fontPath)

		// Заголовок теста
		doc.fontSize(20).text(`Тест: ${test.title} (с ответами)`, { align: 'center' })
		doc.moveDown()
		doc.fontSize(12)
			.text(`Количество вопросов: ${test.questions.length}`)
			.text(`Максимальное количество попыток: ${test.maxAttempts}`)
			.moveDown(2)

		// Обход всех вопросов
		test.questions.forEach((question, index) => {
			// Вопрос и его тип
			doc.fontSize(14)
				.fillColor('black')
				.text(`${index + 1}. ${question.title}`, { underline: true })
			doc.fontSize(10)
				.fillColor('gray')
				.text(`Тип вопроса: ${question.type === 'MULTIPLE_CHOICE' ? 'Множественный выбор' :
					question.type === 'SHORT_ANSWER' ? 'Короткий ответ' :
						'Открытый вопрос'
					}`)
			doc.moveDown(0.5)

			// Обработка разных типов вопросов
			switch (question.type) {
				case 'MULTIPLE_CHOICE':
					// Варианты ответов
					doc.fontSize(12)
						.fillColor('black')
						.text('Варианты ответов:')
					question.options.forEach((option, optIndex) => {
						doc.text(`${String.fromCharCode(65 + optIndex)}) ${option}`)
					})
					doc.moveDown(0.5)
						.fillColor('green')
						.text('Правильные ответы:')
					question.correctAnswers.forEach((correctAnswer, id) => {
						doc.text(`${String.fromCharCode(65 + id)}) ${correctAnswer}`
						)
					})
					break

				case 'SHORT_ANSWER':
					doc.fontSize(12)
						.fillColor('green')
						.text('Правильные ответы:')
						.text(question.correctAnswers.join(' или '))
					break

				case 'TRUE_FALSE':
					doc.fontSize(12)
						.fillColor('green')
						.text('Правильный ответ:')
						.text(question.correctAnswers[0])
					break

				case 'OPEN_QUESTION':
					if (question.correctAnswers && question.correctAnswers.length > 0) {
						doc.fontSize(12)
							.fillColor('green')
							.text('Примерный ответ:')
							.text(question.correctAnswers[0])
					} else {
						doc.fontSize(12)
							.fillColor('gray')
							.text('Требуется ручная проверка')
					}
					break
			}

			// Вес вопроса
			doc.moveDown(0.5)
				.fontSize(10)
				.fillColor('gray')
				.text(`Вес вопроса: ${question.weight || 1} балл(ов)`)

			// Пояснение к вопросу
			if (question.explanation) {
				doc.moveDown(0.5)
					.fillColor('blue')
					.text('Пояснение:', { underline: true })
					.text(question.explanation)
			}

			// Если есть изображение
			if (question.image) {
				doc.moveDown(0.5)
					.fillColor('gray')
					.text('(К вопросу прилагается изображение)')
			}

			doc.moveDown(2)
		})
		doc.end()
	}


}
