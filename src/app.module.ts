import { PrismaService } from '@/prisma/prisma.service'
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AuthModule } from './auth/auth.module'
import { GameGateway } from './game/game.gateway'
import { GameModule } from './game/game.module'
import { GameService } from './game/game.service'
import { QuizController } from './quiz/quiz.controller'
import { QuizService } from './quiz/quiz.service'

@Module({
  providers: [PrismaService, QuizService, GameGateway, GameService],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    GameModule,
  ],
  controllers: [QuizController],
})
export class AppModule { }
