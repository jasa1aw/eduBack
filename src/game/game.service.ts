import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'

@Injectable()
export class GameService {
	constructor(private prisma: PrismaService) { }

	// Получаем список игроков
	async getPlayers(gameId: string) {
		const game = await this.prisma.game.findUnique({
			where: { id: gameId },
			include: { players: true },
		})
		return game?.players ?? []
	}
}
