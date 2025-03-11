import { PrismaService } from '@/prisma/prisma.service'
import { CreateTestDto, AddQuestionDto, UpdateTestDto } from '@/src/dto/quiz.dto'
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import * as PDFDocument from 'pdfkit';
import { Response } from 'express';
import * as path from 'path';

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

	// async create(userId: string, dto: CreateTestDto) {
	// 	if (!userId) throw new ForbiddenException('Unauthorized user')

	// 	return this.prisma.test.create({
	// 		data: {
	// 			title: dto.title,
	// 			creatorId: userId,
	// 			isDraft: dto.isDraft ?? true,
	// 			maxAttempts: dto.maxAttempts ?? 1,
	// 			timeLimit: dto.timeLimit,
	// 			showAnswers: dto.showAnswers ?? false,
	// 			questions: {
	// 				create: (dto.questions ?? []).map(q => ({
	// 					text: q.text,
	// 					options: q.options,
	// 					correctAnswers: q.correctAnswers,
	// 					explanation: q.explanation,
	// 					image: q.image,
	// 					weight: q.weight ?? 1,
	// 					type: q.type,
	// 				})),
	// 			},
	// 		},
	// 	})
	// }

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

	// async update(testId: string, userId: string, dto: UpdateTestDto) {
    // const test = await this.prisma.test.findUnique({
    //     where: { id: testId },
    //     include: { questions: true },
    // })

    // if (!test) throw new NotFoundException('Test not found')
    // if (test.creatorId !== userId) throw new ForbiddenException('Not allowed to edit this test')

    // // Список текущих вопросов
    // const existingQuestionIds = test.questions.map(q => q.id)
    // const incomingQuestionIds = dto.questions?.map(q => q.id).filter(Boolean) || []

    // // Определяем удаленные вопросы
    // const questionsToDelete = existingQuestionIds.filter(id => !incomingQuestionIds.includes(id))

    // // Транзакция обновления
    // await this.prisma.$transaction([
    //     // Обновляем сам тест
    //     this.prisma.test.update({
    //         where: { id: testId },
    //         data: {
    //             title: dto.title,
    //             isDraft: dto.isDraft ?? true,
    //             maxAttempts: dto.maxAttempts,
    //             timeLimit: dto.timeLimit,
    //             showAnswers: dto.showAnswers ?? false,
    //         },
    //     }),

    //     // Удаляем вопросы, которых больше нет в списке
    //     this.prisma.question.deleteMany({
    //         where: { id: { in: questionsToDelete } },
    //     }),

    //     // Обновляем существующие вопросы
    //     ...dto.questions
    //         ?.filter(q => q.id)
    //         .map(q =>
    //             this.prisma.question.update({
    //                 where: { id: q.id },
    //                 data: q,
    //             })
    //         ) || [],

    //     // Добавляем новые вопросы
    //     this.prisma.question.createMany({
    //         data: dto.questions
    //             ?.filter(q => !q.id)
    //             .map(q => ({ ...q, testId })) || [],
    //     }),
    // ])

    // return this.findOne(testId)
	// }
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

	// async submitTest(userId: string, attemptId: string, answers: { questionId: string; selectedAnswers: string[] }[]) {
	// 	// Получаем все вопросы теста с правильными ответами
	// 	const questions = await this.prisma.question.findMany({
	// 		where: { id: { in: answers.map(a => a.questionId) } },
	// 		select: { id: true, correctAnswers: true }
	// 	})

	// 	// Формируем массив для записи ответов
	// 	const attemptAnswers = answers.map(({ questionId, selectedAnswers }) => {
	// 		const question = questions.find(q => q.id === questionId)
	// 		const isCorrect = question ? selectedAnswers.sort().toString() === question.correctAnswers.sort().toString() : false

	// 		return { attemptId, questionId, selectedAnswers, isCorrect }
	// 	})

	// 	// Записываем ответы
	// 	await this.prisma.attemptAnswer.createMany({ data: attemptAnswers })

	// 	// Считаем правильные ответы и высчитываем score
	// 	const correctCount = attemptAnswers.filter(a => a.isCorrect).length
	// 	const score = Math.round((correctCount / answers.length) * 100)

	// 	// Обновляем статус попытки и записываем результат
	// 	await this.prisma.$transaction([
	// 		this.prisma.attempt.update({
	// 			where: { id: attemptId, userId },
	// 			data: { status: 'COMPLETED', endTime: new Date() }
	// 		}),
	// 		this.prisma.result.create({
	// 			data: { attemptId, userId, testId: attemptAnswers[0].questionId, score }
	// 		})
	// 	])

	// 	return { message: 'Test submitted successfully', score }
	// }
	async submitTest(userId: string, attemptId: string, answers: { questionId: string; selectedAnswers: string[] }[]) {
		const questions = await this.prisma.question.findMany({
			where: { id: { in: answers.map(a => a.questionId) } },
			select: { id: true, type: true, correctAnswers: true }
		})
	
		const attemptAnswers = answers.map(({ questionId, selectedAnswers }) => {
			const question = questions.find(q => q.id === questionId)
	
			let isCorrect: boolean | null = false
	
			if (question) {
				if (question.type === 'MULTIPLE_CHOICE') {
					isCorrect = selectedAnswers.sort().toString() === question.correctAnswers.sort().toString()
				} else if (question.type === 'SHORT_ANSWER') {
					// Игнорируем регистр, пробелы и проверяем на эквивалентность
					const normalizedAnswer = selectedAnswers[0]?.trim().toLowerCase()
					const normalizedCorrect = question.correctAnswers.map(a => a.trim().toLowerCase())
	
					isCorrect = normalizedCorrect.includes(normalizedAnswer)
				} else if (question.type === 'OPEN_QUESTION') {
					// Для открытых вопросов автоматическая проверка невозможна
					isCorrect = null
				}
			}
	
			return { attemptId, questionId, selectedAnswers, isCorrect }
		})
	
		await this.prisma.attemptAnswer.createMany({ data: attemptAnswers })
	
		const correctCount = attemptAnswers.filter(a => a.isCorrect === true).length
		const score = Math.round((correctCount / answers.length) * 100)
	
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
	


	// async getTestResults(attemptId: string) {
	// 	return this.prisma.attemptAnswer.findMany({
	// 		where: { attemptId },
	// 		select: {
	// 			questionId: true,
	// 			selectedAnswers: true,
	// 			isCorrect: true, // ✅ Добавляем поле
	// 			question: { select: { correctAnswers: true } },
	// 		},
	// 	})
	// }
	async getTestResults(attemptId: string) {
		return this.prisma.attemptAnswer.findMany({
			where: { attemptId },
			select: {
				questionId: true,
				selectedAnswers: true,
				isCorrect: true,
				question: {
					select: { correctAnswers: true, type: true },
				},
			},
		}).then(results => results.map(r => ({
			...r,
			isCorrect: r.question.type === 'OPEN_QUESTION' ? null : r.isCorrect
		})))
	}

	async exportCompletedTestToPDF(attemptId: string, res: Response) {
		const attempt = await this.prisma.attempt.findUnique({
			where: { id: attemptId },
			include: {
				test: { include: { questions: true } },
				answers: { include: { question: true } },
			},
		});
	
		if (!attempt) {
			throw new NotFoundException('Попытка теста не найдена');
		}
	
		const doc = new PDFDocument();
		res.setHeader('Content-Type', 'application/pdf');
		res.setHeader('Content-Disposition', `attachment; filename=test-results-${attempt.id}.pdf`);
		doc.pipe(res);
	
		// ✅ Указываем путь к шрифту, чтобы точно поддерживалась кириллица
		const fontPath = path.join(process.cwd(), 'src/utils/fonts/Arial.ttf');
		doc.font(fontPath);
	
		// ✅ Заголовок теста
		doc.fontSize(20).text(`Результаты теста: ${attempt.test.title}`, { align: 'center' });
		doc.moveDown(2);
	
		// ✅ Обход всех вопросов и ответов
		attempt.answers.forEach((answer, index) => {
			doc.fontSize(14).text(`${index + 1}. ${answer.question.text}`, { underline: true });
			doc.moveDown(0.5);
	
			// ✅ Выводим все варианты ответа
			answer.question.options.forEach((option, optIndex) => {
				doc.fontSize(12).text(`${String.fromCharCode(65 + optIndex)}) ${option}`);
			});
	
			doc.moveDown(0.5);
	
			// ✅ Формируем ответ пользователя
			const userAnswerText = answer.selectedAnswers.map(sel =>
				`${String.fromCharCode(65 + answer.question.options.indexOf(sel))}) ${sel}`
			).join(', ');
	
			// ✅ Формируем правильный ответ
			const correctAnswerText = answer.question.correctAnswers.map(correct =>
				`${String.fromCharCode(65 + answer.question.options.indexOf(correct))}) ${correct}`
			).join(', ');
	
			doc.fontSize(12).fillColor('blue').text(`Ваш ответ: ${userAnswerText}`);
			doc.fontSize(12).fillColor('green').text(`Правильный ответ: ${correctAnswerText}`);
	
			// ✅ Отображаем статус (верно или нет)
			doc.fontSize(12).fillColor(answer.isCorrect ? 'green' : 'red')
				.text(`Статус: ${answer.isCorrect ? '✅ Верно' : '❌ Неверно'}`);
			
			doc.fillColor('black').moveDown(1.5);
		});
	
		doc.end();
	}
	

    // 📄 Экспорт теста (без ответов)
	async exportTestToPDF(testId: string, res: Response) {
		const test = await this.prisma.test.findUnique({
			where: { id: testId },
			include: { questions: true },
		});
	
		if (!test) {
			throw new NotFoundException('Тест не найден');
		}
	
		const doc = new PDFDocument();
		res.setHeader('Content-Type', 'application/pdf');
		res.setHeader('Content-Disposition', `attachment; filename=test-${test.id}.pdf`);
		doc.pipe(res);
	
		// ✅ Указываем путь к шрифту (чтобы корректно отображалась кириллица)
		const fontPath = path.join(process.cwd(), 'src/utils/fonts/Arial.ttf');
		doc.font(fontPath);
	
		// ✅ Заголовок теста
		doc.fontSize(20).text(`Тест: ${test.title}`, { align: 'center' });
		doc.moveDown(2);
	
		// ✅ Обход всех вопросов
		test.questions.forEach((question, index) => {
			// ✅ Вопрос
			doc.fontSize(14).text(`${index + 1}. ${question.text}`, { underline: true });
			doc.moveDown(0.5);
	
			// ✅ Варианты ответа (A, B, C, ...)
			question.options.forEach((option, optIndex) => {
				doc.fontSize(12).text(`${String.fromCharCode(65 + optIndex)}) ${option}`);
			});
	
			doc.moveDown(1);
		});
	
		doc.end();
	}
	
}