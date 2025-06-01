import { Module } from '@nestjs/common';
import { QuizService } from '@/src/quiz/quiz.service';
import { QuizController } from '@/src/quiz/quiz.controller';
import { PrismaService } from '@/prisma/prisma.service';

@Module({
  controllers: [QuizController],
  providers: [QuizService, PrismaService],
})
export class QuizModule {}
