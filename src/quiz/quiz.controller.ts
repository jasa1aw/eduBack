import { JwtAuthGuard } from '@/src/auth/jwtAuth.guard'
import { AddQuestionDto, CreateTestDto, UpdateTestDto } from '@/src/dto/quiz.dto'
import { QuizService } from '@/src/quiz/quiz.service'
import { Roles } from '@/src/quiz/role.decorator'
import { RoleGuard } from '@/src/quiz/role.guard'
import { Body, Controller, Delete, Get, Param, Patch, Post, Request, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Response } from 'express'
import { diskStorage } from 'multer'
import { extname } from 'path'

@Controller('tests')
@UseGuards(JwtAuthGuard)
export class QuizController {
	constructor(private readonly quizService: QuizService) { }

	@Post()
	@UseGuards(RoleGuard)
	@Roles('TEACHER', 'STUDENT')
	async createTest(@Request() req, @Body() dto: CreateTestDto) {
		return this.quizService.createTest(req.user.id, dto)
	}

	@Post(':testId/questions')
	@UseGuards(RoleGuard)
	@Roles('TEACHER', 'STUDENT')
	@UseInterceptors(
		FileInterceptor('image', {
			storage: diskStorage({
				destination: 'uploads/questions',
				filename: (req, file, cb) => {
					const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
					cb(null, `question-${uniqueSuffix}${extname(file.originalname)}`)
				}
			}),
			fileFilter: (req, file, cb) => {
				if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
					return cb(new Error('Only image files are allowed!'), false)
				}
				cb(null, true)
			}
		})
	)
	async addQuestion(
		@Param('testId') testId: string,
		@Request() req,
		@Body() dto: AddQuestionDto,
		@UploadedFile() image?: Express.Multer.File
	) {
		return this.quizService.addQuestion(testId, req.user.id, dto, image)
	}

	// create(@Request() req, @Body() dto: CreateTestDto) {
	// 	return this.quizService.create(req.user.id, dto)
	// }

	@Get('my-tests')
	findAllByUser(@Request() req) {
		return this.quizService.findAllByUser(req.user.id)
	}

	@Get(':id')
	findOne(@Param('id') id: string) {
		return this.quizService.findOne(id)
	}



	@Patch(':id')
	@UseGuards(RoleGuard)
	@Roles('TEACHER', 'STUDENT')
	update(@Param('id') id: string, @Request() req, @Body() dto: UpdateTestDto) {
		return this.quizService.update(id, req.user.id, dto)
	}

	@Delete(':id')
	@UseGuards(RoleGuard)
	@Roles('TEACHER', 'STUDENT')
	removeTest(@Param('id') id: string) {
		return this.quizService.deleteTest(id)
	}

	@Delete('questions/:questionId')
	@UseGuards(RoleGuard)
	@Roles('TEACHER', 'STUDENT')
	removeQuestion(@Param('questionId') questionId: string) {
		return this.quizService.deleteQuestion(questionId)
	}

	@Post(':testId/start')
	async startTest(@Param('testId') testId: string, @Request() req) {
		return this.quizService.startTest(req.user.id, testId)
	}

	@Post(':attemptId/progress')
	async saveProgress(
		@Param('attemptId') attemptId: string,
		@Request() req,
		@Body() answers: { questionId: string; selectedAnswers?: string[]; userAnswer?: string }[]
	) {
		return this.quizService.saveProgress(req.user.id, attemptId, answers)
	}

	@Patch(':testId/auto-save')
	async autoSaveTest(
		@Param('testId') testId: string,
		@Request() req,
		@Body() dto: UpdateTestDto
	) {
		return this.quizService.autoSaveTest(req.user.id, testId, dto)
	}

	// 2️⃣ Завершение теста и проверка ответов
	@Post(':attemptId/submit')
	async submitTest(
		@Param('attemptId') attemptId: string,
		@Request() req,
		@Body() answers: { questionId: string; selectedAnswers?: string[]; userAnswer?: string }[]
	) {
		return this.quizService.submitTest(req.user.id, attemptId, answers)
	}

	// 3️⃣ Получение результатов теста
	@Get(':attemptId/results')
	async getTestResults(@Param('attemptId') attemptId: string) {
		return this.quizService.getTestResults(attemptId)
	}


	@Get(':attemptId/export-attempt')
	async exportCompletedTestToPDF(@Param('attemptId') attemptId: string, @Res() res: Response) {
		return this.quizService.exportCompletedTestToPDF(attemptId, res)
	}

	// 📄 Экспорт теста в PDF (без ответов)
	

	@Get(':testId/export-with-answers')
	// @UseGuards(RoleGuard)
	// @Roles('TEACHER')  // Только для преподавателей
	async exportTestWithAnswersToPDF(@Param('testId') testId: string, @Res() res: Response) {
		return this.quizService.exportTestWithAnswersToPDF(testId, res)
	}
	@Get(':testId/export')
	async exportTestToPDF(@Param('testId') testId: string, @Res() res: Response) {
		return this.quizService.exportTestToPDF(testId, res)
	}

	@Get('pending')
	@UseGuards(RoleGuard)
	@Roles('TEACHER')
	async getPendingAnswers(@Request() req) {
		return this.quizService.getPendingAnswers(req.user.id)
	}

	// 2️⃣ Проверить открытый вопрос и изменить его статус
	@Patch(':answerId/review')
	@UseGuards(RoleGuard)
	@Roles('TEACHER')
	async reviewAnswer(
		@Request() req,
		@Param('answerId') answerId: string,
		@Body('isCorrect') isCorrect: boolean
	) {
		return this.quizService.reviewAnswer(req.user.id, answerId, isCorrect)
	}

	// 3️⃣ Пересчитать балл попытки
	@Patch(':attemptId/recalculate-score')
	@UseGuards(RoleGuard)
	@Roles('TEACHER')
	async recalculateAttemptScore(@Param('attemptId') attemptId: string) {
		return this.quizService.recalculateAttemptScore(attemptId)
	}
}


