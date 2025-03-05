import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { PrismaService } from '@/prisma/prisma.service';
import { QuizService } from './quiz/quiz.service'
import { QuizController } from './quiz/quiz.controller'

@Module({
  providers: [PrismaService, QuizService],
  imports: [AuthModule],
  controllers: [QuizController],
})
export class AppModule {}
