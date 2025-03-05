import { PrismaService } from '@/prisma/prisma.service'
import { CreateTestDto, UpdateTestDto } from '@/src/dto/quiz.dto'
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'

@Injectable()
export class QuizService {
	constructor(private prisma: PrismaService) { }

	async create(userId: string, dto: CreateTestDto) {
		if (!userId) throw new ForbiddenException('Unauthorized user')

		return this.prisma.test.create({
			data: {
				title: dto.title,
				creatorId: userId,
				isDraft: dto.isDraft ?? true,
				maxAttempts: dto.maxAttempts ?? 1,
				timeLimit: dto.timeLimit,
				showAnswers: dto.showAnswers ?? false,
				questions: {
					create: (dto.questions ?? []).map(q => ({
						text: q.text,
						options: q.options,
						correctAnswers: q.correctAnswers,
						explanation: q.explanation,
						image: q.image,
						weight: q.weight ?? 1,
						type: q.type,
					})),
				},
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

		// Обновляем сам тест
		await this.prisma.test.update({
			where: { id: testId },
			data: {
				title: dto.title,
				isDraft: dto.isDraft ?? true,
				maxAttempts: dto.maxAttempts,
				timeLimit: dto.timeLimit,
				showAnswers: dto.showAnswers ?? false,
			},
		})

		// Обновляем или создаем вопросы
		for (const questionDto of dto.questions ?? []) {
			if (questionDto.id) {
				await this.prisma.question.update({
					where: { id: questionDto.id },
					data: questionDto,
				})
			} else {
				await this.prisma.question.create({
					data: { ...questionDto, testId },
				})
			}
		}

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

	async submitTest(userId: string, attemptId: string, answers: { questionId: string; selectedAnswers: string[] }[]) {
		// Получаем все вопросы теста с правильными ответами
		const questions = await this.prisma.question.findMany({
			where: { id: { in: answers.map(a => a.questionId) } },
			select: { id: true, correctAnswers: true }
		})

		// Формируем массив для записи ответов
		const attemptAnswers = answers.map(({ questionId, selectedAnswers }) => {
			const question = questions.find(q => q.id === questionId)
			const isCorrect = question ? selectedAnswers.sort().toString() === question.correctAnswers.sort().toString() : false

			return { attemptId, questionId, selectedAnswers, isCorrect }
		})

		// Записываем ответы
		await this.prisma.attemptAnswer.createMany({ data: attemptAnswers })

		// Считаем правильные ответы и высчитываем score
		const correctCount = attemptAnswers.filter(a => a.isCorrect).length
		const score = Math.round((correctCount / answers.length) * 100)

		// Обновляем статус попытки и записываем результат
		await this.prisma.$transaction([
			this.prisma.attempt.update({
				where: { id: attemptId, userId },
				data: { status: 'COMPLETED', endTime: new Date() }
			}),
			this.prisma.result.create({
				data: { attemptId, userId, testId: attemptAnswers[0].questionId, score }
			})
		])

		return { message: 'Test submitted successfully', score }
	}


	async getTestResults(attemptId: string) {
		return this.prisma.attemptAnswer.findMany({
			where: { attemptId },
			select: {
				questionId: true,
				selectedAnswers: true,
				isCorrect: true, // ✅ Добавляем поле
				question: { select: { correctAnswers: true } },
			},
		})
	}


}
