import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'
import { randomUUID } from 'crypto'
import * as QRCode from 'qrcode'

@Injectable()
export class InviteService {
	constructor(private prisma: PrismaService) { }

	// 📌 Генерация уникального токена для приглашения
	async generateInvite(gameId: string, email?: string) {
		const token = randomUUID()

		const invite = await this.prisma.invite.create({
			data: {
				gameId,
				email,
				token,
			},
		})

		const inviteLink = `${process.env.FRONTEND_URL}/invite/${token}`
		const qrCode = await QRCode.toDataURL(inviteLink) // Генерация QR-кода

		return { inviteLink, qrCode }
	}

	// 📌 Проверка токена и подключение игрока
	async acceptInvite(token: string, userId?: string) {
		const invite = await this.prisma.invite.findUnique({
			where: { token },
			include: { game: true },
		})

		if (!invite) throw new Error('Приглашение не найдено или уже использовано')

		// Если пользователь не зарегистрирован → создаем временного
		let guestId = userId
		if (!userId) {
			const guest = await this.prisma.user.create({
				data: { email: `guest_${randomUUID()}@game.com`, password: '', name: 'Guest', role: 'STUDENT' },
			})
			guestId = guest.id
		}

		// Добавляем игрока в игру
		await this.prisma.game.update({
			where: { id: invite.gameId },
			data: { players: { connect: { id: guestId } } },
		})

		return { gameId: invite.gameId, userId: guestId }
	}
}
