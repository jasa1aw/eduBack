import { JwtAuthGuard } from '@/src/auth/jwtAuth.guard'
import { CreateTestDto, UpdateTestDto, AddQuestionDto } from '@/src/dto/quiz.dto'
import { QuizService } from '@/src/quiz/quiz.service'
import { Roles } from '@/src/quiz/role.decorator'
import { RoleGuard } from '@/src/quiz/role.guard'
import { Body, Controller, Delete, Get, Param, Patch, Post, Request, UseGuards, Res } from '@nestjs/common'
import { Response } from 'express';

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
	async addQuestion(@Param('testId') testId: string, @Request() req, @Body() dto: AddQuestionDto) {
		return this.quizService.addQuestion(testId, req.user.id, dto)
	}

	// create(@Request() req, @Body() dto: CreateTestDto) {
	// 	return this.quizService.create(req.user.id, dto)
	// }


	@Get(':id')
	findOne(@Param('id') id: string) {
		return this.quizService.findOne(id)
	}

	@Get('user/:userId')
	findAllByUser(@Param('userId') userId: string) {
		return this.quizService.findAllByUser(userId)
	}

	@Patch(':id')
	@UseGuards(RoleGuard)
	@Roles('TEACHER', 'STUDENT')
	update(@Param('id') testId: string, @Request() req, @Body() dto: UpdateTestDto) {
		return this.quizService.update(testId, req.user.id, dto)
	}

	@Delete(':id')
	@UseGuards(RoleGuard)
	@Roles('TEACHER', 'STUDENT')
	removeTest(@Param('id') id: string) {
		return this.quizService.deleteTest(id)
	}

	@Delete(':testId/questions/:questionId')
	@UseGuards(RoleGuard)
	@Roles('TEACHER', 'STUDENT')
	removeQuestion(@Param('testId') testId: string, @Param('questionId') questionId: string) {
		return this.quizService.deleteQuestion(testId, questionId)
	}

	@Post(':testId/start')
    async startTest(@Param('testId') testId: string, @Body('userId') userId: string) {
        return this.quizService.startTest(userId, testId);
    }

    // 2️⃣ Завершение теста и проверка ответов
    @Post(':attemptId/submit')
    async submitTest(
        @Param('attemptId') attemptId: string,
        @Body('userId') userId: string,
        @Body('answers') answers: { questionId: string; selectedAnswers: string[] }[]
    ) {
        return this.quizService.submitTest(userId, attemptId, answers);
    }

    // 3️⃣ Получение результатов теста
    @Get(':attemptId/results')
    async getTestResults(@Param('attemptId') attemptId: string) {
        return this.quizService.getTestResults(attemptId);
    }


	@Get(':attemptId/export-results')
    async exportCompletedTest(@Param('attemptId') attemptId: string, @Res() res: Response) {
        return this.quizService.exportCompletedTestToPDF(attemptId, res);
    }

    // 📄 Экспорт теста в PDF (без ответов)
    @Get(':testId/export')
    async exportTest(@Param('testId') testId: string, @Res() res: Response) {
        return this.quizService.exportTestToPDF(testId, res);
    }
}


