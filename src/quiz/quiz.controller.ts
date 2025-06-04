import { JwtAuthGuard } from '@/src/auth/jwtAuth.guard';
import {
  AddQuestionDto,
  CreateTestDto,
  UpdateQuestionDto,
  UpdateTestDto,
} from '@/src/dto/quiz.dto';
import {
  ExamTestResponse,
  ExamTestResultsResponse,
  PracticeTestResponse,
  PracticeTestResultsResponse,
  QuizService,
} from '@/src/quiz/quiz.service';
import { Roles } from '@/src/quiz/role.decorator';
import { RoleGuard } from '@/src/quiz/role.guard';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Controller('tests')
@UseGuards(JwtAuthGuard)
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  // Test Management
  @Post()
  @UseGuards(RoleGuard)
  @Roles('TEACHER', 'STUDENT')
  async createTest(@Request() req, @Body() dto: CreateTestDto) {
    return this.quizService.createTest(req.user.id, dto);
  }

	// Static routes MUST come before dynamic routes with parameters
	@Get('my-tests')
	findAllByUser(@Request() req) {
		return this.quizService.findAllByUser(req.user.id)
	}

	@Get('game-tests')
	findPublishedByUser(@Request() req) {
		return this.quizService.findPublishedByUser(req.user.id)
	}

	// Teacher specific endpoints
	@Get('pending')
	@UseGuards(RoleGuard)
	@Roles('TEACHER')
	async getPendingAnswers(@Request() req) {
		return this.quizService.getPendingAnswers(req.user.id)
	}

	// Dynamic routes with parameters come after static routes
	@Get(':id')
	findOne(@Param('id', ParseUUIDPipe) id: string) {
		return this.quizService.findOne(id)
	}

  @Patch(':id')
  @UseGuards(RoleGuard)
  @Roles('TEACHER', 'STUDENT')
  updateTest(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req,
    @Body() dto: UpdateTestDto,
  ) {
    return this.quizService.updateTest(id, req.user.id, dto);
  }

  @Delete(':id')
  @UseGuards(RoleGuard)
  @Roles('TEACHER', 'STUDENT')
  removeTest(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.quizService.deleteTest(id, req.user.id);
  }

  // Question Management
  @Post(':testId/questions')
  @UseGuards(RoleGuard)
  @Roles('TEACHER', 'STUDENT')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: 'uploads/questions',
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `question-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
          return cb(new Error('Only image files are allowed!'), false);
        }
        cb(null, true);
      },
    }),
  )
  async addQuestion(
    @Param('testId', ParseUUIDPipe) testId: string,
    @Request() req,
    @Body() dto: AddQuestionDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    return this.quizService.addQuestion(testId, req.user.id, dto, image);
  }

  @Patch('questions/:questionId')
  @UseGuards(RoleGuard)
  @Roles('TEACHER', 'STUDENT')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: 'uploads/questions',
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `question-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
          return cb(new Error('Only image files are allowed!'), false);
        }
        cb(null, true);
      },
    }),
  )
  async updateQuestion(
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Request() req,
    @Body() questionData: UpdateQuestionDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    if (image) {
      questionData.image = image.path;
    }
    return this.quizService.updateQuestion(
      questionId,
      req.user.id,
      questionData,
    );
  }

  @Delete('questions/:questionId')
  @UseGuards(RoleGuard)
  @Roles('TEACHER', 'STUDENT')
  removeQuestion(
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Request() req,
  ) {
    return this.quizService.deleteQuestion(questionId, req.user.id);
  }

  // Export functionality
  @Get(':attemptId/export-attempt')
  async exportCompletedTestToPDF(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Res() res: Response,
  ) {
    return this.quizService.exportCompletedTestToPDF(attemptId, res);
  }

  @Get(':testId/export-with-answers')
  async exportTestWithAnswersToPDF(
    @Param('testId', ParseUUIDPipe) testId: string,
    @Res() res: Response,
  ) {
    return this.quizService.exportTestWithAnswersToPDF(testId, res);
  }

  @Get(':testId/export')
  async exportTestToPDF(
    @Param('testId', ParseUUIDPipe) testId: string,
    @Res() res: Response,
  ) {
    return this.quizService.exportTestToPDF(testId, res);
  }

	// Progress saving (universal for both modes)
	@Post(':attemptId/progress')
	async saveProgress(
		@Param('attemptId', ParseUUIDPipe) attemptId: string,
		@Request() req,
		@Body() body: { answer: { questionId: string; selectedAnswers?: string[]; userAnswer?: string } }
	) {
		return this.quizService.saveProgress(req.user.id, attemptId, body.answer)
	}

	@Get(':attemptId/questions')
	async getQuestionsAttempt(@Param('attemptId', ParseUUIDPipe) attemptId: string) {
		return this.quizService.getQuestionsAttempt(attemptId)
	}

  @Get(':attemptId/resume/:questionId')
  async resumeAttempt(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Request() req,
  ) {
    return this.quizService.resumeAttempt(req.user.id, attemptId, questionId);
  }

  // Practice Mode Endpoints
  @Post(':testId/start-practice')
  async startPracticeTest(
    @Param('testId', ParseUUIDPipe) testId: string,
    @Request() req,
  ) {
    return this.quizService.startPracticeTest(req.user.id, testId);
  }

  @Post(':attemptId/submit-practice')
  async submitPracticeTest(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Request() req,
  ): Promise<PracticeTestResponse> {
    return this.quizService.submitPracticeTest(req.user.id, attemptId);
  }

  @Get(':attemptId/results')
  async getTestResults(@Param('attemptId', ParseUUIDPipe) attemptId: string) {
    return this.quizService.getTestResults(attemptId);
  }

  @Get(':attemptId/practice-results')
  async getPracticeTestResults(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
  ): Promise<PracticeTestResultsResponse> {
    return this.quizService.getPracticeTestResults(attemptId);
  }

  // Exam Mode Endpoints
  @Post(':testId/start-exam')
  async startExamTest(
    @Param('testId', ParseUUIDPipe) testId: string,
    @Request() req,
  ) {
    return this.quizService.startExamTest(req.user.id, testId);
  }

  @Post(':attemptId/submit-exam')
  async submitExamTest(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Request() req,
  ): Promise<ExamTestResponse> {
    return this.quizService.submitExamTest(req.user.id, attemptId);
  }

  @Get(':attemptId/exam-results')
  async getExamTestResults(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
  ): Promise<ExamTestResultsResponse> {
    return this.quizService.getExamTestResults(attemptId);
  }

	@Get(':attemptId/question/:questionId')
	async getQuestion(
		@Param('attemptId', ParseUUIDPipe) attemptId: string,
		@Param('questionId', ParseUUIDPipe) questionId: string,
		@Request() req
	) {
		return this.quizService.getQuestion(req.user.id, attemptId, questionId)
	}

	// Additional Teacher specific endpoints
	@Patch(':answerId/review')
	@UseGuards(RoleGuard)
	@Roles('TEACHER')
	async reviewAnswer(
		@Request() req,
		@Param('answerId', ParseUUIDPipe) answerId: string,
		@Body('isCorrect') isCorrect: boolean
	) {
		return this.quizService.reviewAnswer(req.user.id, answerId, isCorrect)
	}

	@Patch(':attemptId/recalculate-score')
	@UseGuards(RoleGuard)
	@Roles('TEACHER')
	async recalculateAttemptScore(@Param('attemptId', ParseUUIDPipe) attemptId: string) {
		return this.quizService.recalculateAttemptScore(attemptId)
	}
}
