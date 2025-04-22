import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { PrismaService } from '@/prisma/prisma.service';
import { QuizService } from './quiz/quiz.service'
import { QuizController } from './quiz/quiz.controller'
import { GameGateway } from './game/game.gateway';
import { GameService } from './game/game.service';
import { GameModule } from './game/game.module';
import { InviteController } from './game/invite.controller'

@Module({
  providers: [PrismaService, QuizService, GameGateway, GameService],
  imports: [AuthModule, GameModule],
  controllers: [QuizController],
})
export class AppModule {}
