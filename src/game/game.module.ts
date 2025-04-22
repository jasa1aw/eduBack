import { Module } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service'
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';
import { InviteService } from './invite.service'
import { InviteController } from './invite.controller'

@Module({
	providers: [GameGateway, GameService, PrismaService, InviteService],
	controllers: [InviteController],
	exports: [InviteService],
})
export class GameModule {}
