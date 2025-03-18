import { PrismaService } from '@/prisma/prisma.service'
import { AnswerStatus } from '@prisma/client'
import { CreateTestDto, AddQuestionDto, UpdateTestDto } from '@/src/dto/quiz.dto'
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import * as PDFDocument from 'pdfkit'
import { Response } from 'express'
import * as path from 'path'

@Injectable()
export class QuizService {
	constructor(private prisma: PrismaService) { }

	async createTest(userId: string, dto: CreateTestDto) {
		if (!userId) throw new ForbiddenException('Unauthorized user')

		return this.prisma.test.create({
			data: {
				title: dto.title,
				creatorId: userId,
				isDraft: dto.isDraft ?? true,
				maxAttempts: dto.maxAttempts ?? 1,
				timeLimit: dto.timeLimit,
				showAnswers: dto.showAnswers ?? false,
			},
		})
	}

	async addQuestion(testId: string, userId: string, dto: AddQuestionDto) {
		// Проверка: существует ли тест?
		const test = await this.prisma.test.findUnique({
			where: { id: testId },
			select: { creatorId: true }
		})

		if (!test) throw new NotFoundException('Test not found')
		if (test.creatorId !== userId) throw new ForbiddenException('Not allowed to add questions to this test')

		return this.prisma.question.create({
			data: {
				testId,
				text: dto.text,
				type: dto.type,
				options: dto.options ?? [],
				correctAnswers: dto.correctAnswers ?? [],
				explanation: dto.explanation,
				image: dto.image,
				weight: dto.weight ?? 1,
			},
		})
	}

	async findAllByUser(userId: string) {
		if (!userId) throw new ForbiddenException('Unauthorized user')

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

	async update(testId: string, userId: string, dto: UpdateTestDto) {
		const test = await this.prisma.test.findUnique({
			where: { id: testId },
			include: { questions: true },
		})

		if (!test) throw new NotFoundException('Test not found')
		if (test.creatorId !== userId) throw new ForbiddenException('Not allowed to edit this test')

		// Список текущих вопросов
		const existingQuestionIds = test.questions.map(q => q.id)
		const incomingQuestions = dto.questions ?? []
		const incomingQuestionIds = incomingQuestions.map(q => q.id).filter(Boolean)

		// Определяем удаленные вопросы
		const questionsToDelete = existingQuestionIds.filter(id => !incomingQuestionIds.includes(id))

		// Транзакция обновления
		await this.prisma.$transaction([
			// Обновляем сам тест
			this.prisma.test.update({
				where: { id: testId },
				data: {
					title: dto.title,
					isDraft: dto.isDraft ?? true,
					maxAttempts: dto.maxAttempts,
					timeLimit: dto.timeLimit,
					showAnswers: dto.showAnswers ?? false,
				},
			}),

			// Удаляем вопросы (с проверкой testId)
			this.prisma.question.deleteMany({
				where: { id: { in: questionsToDelete }, testId },
			}),

			// Обновляем существующие вопросы (используем updateMany)
			...incomingQuestions
				.filter(q => q.id)
				.map(q =>
					this.prisma.question.update({
						where: { id: q.id, testId },
						data: {
							text: q.text,
							type: q.type,
							options: q.options,
							correctAnswers: q.correctAnswers,
							explanation: q.explanation,
							image: q.image,
							weight: q.weight,
						},
					})
				),

			// Добавляем новые вопросы (заменяем createMany на create)
			...incomingQuestions
				.filter(q => !q.id)
				.map(q =>
					this.prisma.question.create({
						data: { ...q, testId },
					})
				),
		])

		return this.findOne(testId)
	}

	async deleteTest(id: string) {
		return this.prisma.test.delete({ where: { id: id } })
	}

	async deleteQuestion(testId: string, questionId: string) {
		const question = await this.prisma.question.findUnique({
			where: { id: questionId, testId },
		})

		if (!question) throw new NotFoundException('Question not found in this test')

		return this.prisma.question.delete({ where: { id: questionId } })
	}

	async startTest(userId: string, testId: string) {
		const attempt = await this.prisma.attempt.create({
			data: {
				userId,
				testId,
				startTime: new Date(),
				status: 'IN_PROGRESS',
			},
		})

		const test = await this.prisma.test.findUnique({
			where: { id: testId },
			include: { questions: true },
		})

		return { attemptId: attempt.id, test }
	}

	// async saveProgress(userId: string, attemptId: string, answers: { questionId: string; selectedAnswers: string[] }[]) {
	// 	const attempt = await this.prisma.attempt.findUnique({
	// 		where: { id: attemptId, userId },
	// 	})

	// 	if (!attempt) throw new NotFoundException('Attempt not found')

	// 	return this.prisma.attempt.update({
	// 		where: { id: attemptId },
	// 		data: {
	// 			progress: JSON.stringify(answers),
	// 		},
	// 	})
	// }
	// async submitTest(
	// 	userId: string,
	// 	attemptId: string,
	// 	answers: { questionId: string; selectedAnswers: string[] }[]
	// ) {
	// 	if (!userId || !attemptId || !answers.length) {
	// 		throw new Error('Invalid input data')
	// 	}

	// 	const attempt = await this.prisma.attempt.findUnique({
	// 		where: { id: attemptId, userId },
	// 		select: { testId: true }
	// 	})

	// 	if (!attempt) {
	// 		throw new Error('Attempt not found or unauthorized')
	// 	}

	// 	const questions = await this.prisma.question.findMany({
	// 		where: { id: { in: answers.map(a => a.questionId) } },
	// 		select: { id: true, type: true, correctAnswers: true, weight: true }
	// 	})

	// 	const attemptAnswers = answers.map(({ questionId, selectedAnswers }) => {
	// 		const question = questions.find(q => q.id === questionId)
	// 		let isCorrect: boolean | null = false

	// 		if (question) {
	// 			if (question.type === 'MULTIPLE_CHOICE') {
	// 				// Корректная проверка множества ответов
	// 				const sortedSelected = selectedAnswers.slice().sort()
	// 				const sortedCorrect = question.correctAnswers.slice().sort()
	// 				isCorrect = sortedSelected.length === sortedCorrect.length &&
	// 					sortedSelected.every((v, i) => v === sortedCorrect[i])
	// 			} else if (question.type === 'SHORT_ANSWER') {
	// 				const normalizedSelected = selectedAnswers[0]?.trim().toLowerCase() || ''
	// 				const normalizedCorrect = question.correctAnswers.map(a => a.trim().toLowerCase())
	// 				isCorrect = normalizedCorrect.includes(normalizedSelected)
	// 			} else if (question.type === 'OPEN_QUESTION') {
	// 				isCorrect = null
	// 			}
	// 		}

	// 		return { attemptId, questionId, selectedAnswers, isCorrect }
	// 	})

	// 	await this.prisma.attemptAnswer.createMany({ data: attemptAnswers })


	// 	const totalWeight = questions.reduce((sum, q) => sum + (q.weight || 1), 0)
	// 	const weightedScore = attemptAnswers
	// 		.filter(a => a.isCorrect === true)
	// 		.reduce((sum, a) => {
	// 			const question = questions.find(q => q.id === a.questionId)
	// 			return sum + (question?.weight || 1)
	// 		}, 0)
	// 	const score = totalWeight > 0 ? Math.round((weightedScore / totalWeight) * 100) : 0

	// 	await this.prisma.$transaction([
	// 		this.prisma.attempt.update({
	// 			where: { id: attemptId, userId },
	// 			data: { status: 'COMPLETED', endTime: new Date() }
	// 		}),
	// 		this.prisma.result.create({
	// 			data: { attemptId, userId, testId: attempt.testId, score }
	// 		})
	// 	])

	// 	return { message: 'Test submitted successfully', score }
	// }
	async saveProgress(
		userId: string,
		attemptId: string,
		answers: { questionId: string; selectedAnswers?: string[]; userAnswer?: string }[]
	) {
		const attempt = await this.prisma.attempt.findUnique({
			where: { id: attemptId, userId },
		})

		if (!attempt) throw new NotFoundException('Attempt not found')

		return this.prisma.attempt.update({
			where: { id: attemptId },
			data: {
				progress: JSON.stringify(answers.map(({ questionId, selectedAnswers, userAnswer }) => ({
					questionId,
					selectedAnswers: selectedAnswers || [], // По умолчанию пустой массив
					userAnswer: userAnswer || null, // По умолчанию null
				}))),
			},
		})
	}

	async submitTest(
		userId: string,
		attemptId: string,
		answers: { questionId: string; selectedAnswers?: string[]; userAnswer?: string }[]
	) {
		if (!userId || !attemptId || !answers.length) {
			throw new Error('Invalid input data')
		}

		const attempt = await this.prisma.attempt.findUnique({
			where: { id: attemptId, userId },
			select: { testId: true }
		})

		if (!attempt) {
			throw new Error('Attempt not found or unauthorized')
		}

		const questions = await this.prisma.question.findMany({
			where: { id: { in: answers.map(a => a.questionId) } },
			select: { id: true, type: true, correctAnswers: true, weight: true }
		})

		const attemptAnswers = answers.map(({ questionId, selectedAnswers, userAnswer }) => {
			const question = questions.find(q => q.id === questionId)
			let isCorrect: boolean | null = false

			if (question) {
				if (question.type === 'MULTIPLE_CHOICE') {
					const sortedSelected = (selectedAnswers || []).slice().sort()
					const sortedCorrect = question.correctAnswers.slice().sort()
					isCorrect =
						sortedSelected.length === sortedCorrect.length &&
						sortedSelected.every((v, i) => v === sortedCorrect[i])
				} else if (question.type === 'SHORT_ANSWER') {
					const normalizedSelected = userAnswer?.trim().toLowerCase() || ''
					const normalizedCorrect = question.correctAnswers.map(a => a.trim().toLowerCase())
					isCorrect = normalizedCorrect.includes(normalizedSelected)
				} else if (question.type === 'OPEN_QUESTION') {
					isCorrect = null // Открытые вопросы проверяются вручную, балл не ставим
				}
			}

			return {
				attemptId,
				questionId,
				selectedAnswers: selectedAnswers || [],
				userAnswer: userAnswer || null,
				isCorrect
			}
		})

		await this.prisma.attemptAnswer.createMany({ data: attemptAnswers })

		// 📊 Подсчет баллов
		const totalWeight = questions.reduce((sum, q) => sum + (q.weight || 1), 0)
		const weightedScore = attemptAnswers
			.filter(a => a.isCorrect === true)
			.reduce((sum, a) => {
				const question = questions.find(q => q.id === a.questionId)
				return sum + (question?.weight || 1)
			}, 0)
		const score = totalWeight > 0 ? Math.round((weightedScore / totalWeight) * 100) : 0

		await this.prisma.$transaction([
			this.prisma.attempt.update({
				where: { id: attemptId, userId },
				data: { status: 'COMPLETED', endTime: new Date() }
			}),
			this.prisma.result.create({
				data: { attemptId, userId, testId: attempt.testId, score }
			})
		])

		return { message: 'Test submitted successfully', score }
	}

	async autoSaveTest(userId: string, testId: string, dto: UpdateTestDto) {
		const test = await this.prisma.test.findUnique({
			where: { id: testId },
		})

		if (!test) throw new NotFoundException('Test not found')
		if (test.creatorId !== userId) throw new ForbiddenException('Not allowed to edit this test')

		return this.prisma.test.update({
			where: { id: testId },
			data: {
				title: dto.title ?? test.title,
				isDraft: true,
				maxAttempts: dto.maxAttempts ?? test.maxAttempts,
				timeLimit: dto.timeLimit ?? test.timeLimit,
				showAnswers: dto.showAnswers ?? test.showAnswers,
			},
		})
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
					select: { text: true },
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

		const answers = await this.prisma.attemptAnswer.findMany({
			where: { attemptId },
			select: { isCorrect: true, question: { select: { weight: true } } },
		})

		const totalWeight = answers.reduce((sum, a) => sum + (a.question.weight || 1), 0)
		const correctWeight = answers.filter(a => a.isCorrect).reduce((sum, a) => sum + (a.question.weight || 1), 0)

		const newScore = totalWeight > 0 ? Math.round((correctWeight / totalWeight) * 100) : 0

		// Находим уникальный ID результата
		const result = await this.prisma.result.findFirst({
			where: { attemptId },
			select: { id: true },
		})

		if (!result) throw new NotFoundException('Результат не найден')

		return this.prisma.result.update({
			where: { id: result.id }, // ✅ Используем ID
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
				status: AnswerStatus.CHECKED, // ✅ Или AnswerStatus.CORRECT/INCORRECT, если добавил в schema.prisma
			},
		})

		return this.recalculateAttemptScore(answer.attemptId)
	}

	async getTestResults(attemptId: string) {
		return this.prisma.attemptAnswer.findMany({
			where: { attemptId },
			select: {
				questionId: true,
				selectedAnswers: true,
				userAnswer: true,
				isCorrect: true,
				question: {
					select: { correctAnswers: true, type: true },
				},
			},
		}).then(results => results.map(r => ({
			...r,
			isCorrect: r.question.type === 'OPEN_QUESTION' ? null : r.isCorrect,
			userAnswer: r.question.type === 'SHORT_ANSWER' || r.question.type === 'OPEN_QUESTION' ? r.userAnswer : null
		})))
	}

	async exportCompletedTestToPDF(attemptId: string, res: Response) {
		const attempt = await this.prisma.attempt.findUnique({
			where: { id: attemptId },
			include: {
				test: { include: { questions: true } },
				answers: { include: { question: true } },
			},
		})

		if (!attempt) {
			throw new NotFoundException('Попытка теста не найдена')
		}

		const doc = new PDFDocument()
		res.setHeader('Content-Type', 'application/pdf')
		res.setHeader('Content-Disposition', `attachment; filename=test-results-${attempt.id}.pdf`)
		doc.pipe(res)

		// ✅ Указываем путь к шрифту, чтобы точно поддерживалась кириллица
		const fontPath = path.join(process.cwd(), 'src/utils/fonts/Arial.ttf')
		doc.font(fontPath)

		// ✅ Заголовок теста
		doc.fontSize(20).text(`Результаты теста: ${attempt.test.title}`, { align: 'center' })
		doc.moveDown(2)

		// ✅ Обход всех вопросов и ответов
		attempt.answers.forEach((answer, index) => {
			doc.fontSize(14).text(`${index + 1}. ${answer.question.text}`, { underline: true })
			doc.moveDown(0.5)

			// ✅ Выводим все варианты ответа
			answer.question.options.forEach((option, optIndex) => {
				doc.fontSize(12).text(`${String.fromCharCode(65 + optIndex)}) ${option}`)
			})

			doc.moveDown(0.5)

			// ✅ Формируем ответ пользователя
			const userAnswerText = answer.selectedAnswers.map(sel =>
				`${String.fromCharCode(65 + answer.question.options.indexOf(sel))}) ${sel}`
			).join(', ')

			// ✅ Формируем правильный ответ
			const correctAnswerText = answer.question.correctAnswers.map(correct =>
				`${String.fromCharCode(65 + answer.question.options.indexOf(correct))}) ${correct}`
			).join(', ')

			doc.fontSize(12).fillColor('blue').text(`Ваш ответ: ${userAnswerText}`)
			doc.fontSize(12).fillColor('green').text(`Правильный ответ: ${correctAnswerText}`)

			// ✅ Отображаем статус (верно или нет)
			doc.fontSize(12).fillColor(answer.isCorrect ? 'green' : 'red')
				.text(`Статус: ${answer.isCorrect ? '✅ Верно' : '❌ Неверно'}`)

			doc.fillColor('black').moveDown(1.5)
		})

		doc.end()
	}

	// 📄 Экспорт теста (без ответов)
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
			doc.fontSize(14).text(`${index + 1}. ${question.text}`, { underline: true })
			doc.moveDown(0.5)

			// ✅ Варианты ответа (A, B, C, ...)
			question.options.forEach((option, optIndex) => {
				doc.fontSize(12).text(`${String.fromCharCode(65 + optIndex)}) ${option}`)
			})

			doc.moveDown(1)
		})

		doc.end()
	}



}