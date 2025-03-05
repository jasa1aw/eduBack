import { Injectable } from '@nestjs/common'
import { MailerService } from '@nestjs-modules/mailer'

@Injectable()
export class EmailService {
	constructor(private readonly mailerService: MailerService) { }

	async sendVerificationEmail(email: string, code: string): Promise<void> {
		await this.mailerService.sendMail({
			to: email,
			subject: 'Email Verification',
			text: `Your verification code: ${code}`,
			html: `<p>Your verification code: <strong>${code}</strong></p>`,
		})
	}

	async sendPasswordReset(email: string, code: string): Promise<void> {
		await this.mailerService.sendMail({
			to: email,
			subject: 'Password Reset Request',
			text: `reset your password, Your verification code: ${code}`,
			html: `<p>reset your password, Your verification code: <strong>${code}</strong></p>`,
		})
	}
}
