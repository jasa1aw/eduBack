import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  async sendVerificationEmail(email: string, code: string): Promise<void> {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Email Verification',
      text: `Your verification code: ${code}`,
      html: `<p>Your verification code: <strong>${code}</strong></p>`,
    });
  }

  async sendPasswordReset(email: string, token: string): Promise<void> {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    if (!frontendUrl) {
      throw new Error('FRONTEND_URL is not defined in the configuration');
    }

    const resetUrl = `${frontendUrl}/reset-password?token=${token}&email=${email}`;
    await this.mailerService.sendMail({
      to: email,
      subject: 'Password Reset Request',
      text: `Click the following link to reset your password: ${resetUrl}`,
      html: `<p>Click the following link to reset your password: <a href="${resetUrl}" target="_blank">Reset Password</a></p>`,
    });
  }

  async sendEmailChangeVerification(
    email: string,
    token: string,
  ): Promise<void> {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    if (!frontendUrl) {
      throw new Error('FRONTEND_URL is not defined in the configuration');
    }

    const verificationUrl = `${frontendUrl}/change-email?token=${token}`;
    await this.mailerService.sendMail({
      to: email,
      subject: 'Email Change Verification',
      text: `Click the following link to confirm your email change: ${verificationUrl}`,
      html: `<p>Click the following link to confirm your email change: <a href="${verificationUrl}">Confirm Email Change</a></p>`,
    });
  }
}
