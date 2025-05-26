import { PrismaService } from '@/prisma/prisma.service'
import { Module } from '@nestjs/common'
import { GameController } from './game.controller'
import { GameGateway } from './game.gateway'
import { GameService } from './game.service'
import { InviteController } from './invite.controller'
import { InviteService } from './invite.service'

@Module({
	providers: [GameGateway, GameService, PrismaService, InviteService],
	controllers: [GameController, InviteController],
	exports: [GameService, InviteService],
})
export class GameModule { }