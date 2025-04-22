import { Controller, Post, Param, Body, Get } from '@nestjs/common'
import { InviteService } from './invite.service'

@Controller('invite')
export class InviteController {
	constructor(private inviteService: InviteService) { }

	// 🔗 Создать приглашение
	@Post('generate')
	async generateInvite(@Body('gameId') gameId: string, @Body('email') email?: string) {
		return this.inviteService.generateInvite(gameId, email)
	}

	// ✅ Принять приглашение
	@Get(':token')
	async acceptInvite(@Param('token') token: string, @Body('userId') userId?: string) {
		return this.inviteService.acceptInvite(token, userId)
	}
}
