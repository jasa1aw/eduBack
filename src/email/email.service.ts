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

	async sendPasswordReset(email: string, token: string): Promise<void> {
		await this.mailerService.sendMail({
			to: email,
			subject: 'Password Reset Request',
			text: `Click the following link to reset your password: ${process.env.APP_URL}/reset-password?token=${token}`,
			html: `<p>Click the following link to reset your password:</p>
             <a href="${process.env.APP_URL}/reset-password?token=${token}">Reset Password</a>`,
		})
	}
}
