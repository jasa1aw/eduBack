import { PrismaService } from '@/prisma/prisma.service'
import { LoginDto, RegisterDto, VerifyEmailDto, UpdateProfileDto, ResetPasswordDto, ChangeEmailDto, ChangeEmailConfirmDto } from '@/src/dto/auth.dto'
import { EmailService } from '@/src/email/email.service'
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import { Response } from 'express'
import { generateVerifyCode } from '@/src/constanst/index'

@Injectable()
export class AuthService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly jwtService: JwtService,
		private readonly emailService: EmailService,
	) { }

	
	async register(dto: RegisterDto) {
		const { name, email, password } = dto
		if (await this.prisma.user.findUnique({ where: { email } })) {
			throw new BadRequestException('Email already in use')
		}
		setImmediate(async () => {
			try {
				const hashedPassword = await bcrypt.hash(password, 10);
				const verifyCode = generateVerifyCode()
	
				await this.prisma.user.create({
					data: { name, email, password: hashedPassword, verifyCode },
				});
	
				this.emailService.sendVerificationEmail(email, verifyCode)
        			.catch(err => console.error('Ошибка отправки письма:', err));
			} catch (error) {
				console.error('Ошибка при создании пользователя:', error);
			}
		});
		return { message: 'Verification code sent to email' }
	}

	async registerForTeacher(dto: RegisterDto) {
		const { name, email, password } = dto;
		if (await this.prisma.user.findUnique({ where: { email } })) {
			throw new BadRequestException('Email already in use');
		}
		setImmediate(async () => {
			try {
				const hashedPassword = await bcrypt.hash(password, 10);
				const verifyCode = generateVerifyCode();
	
				await this.prisma.user.create({
					data: { name, email, password: hashedPassword, verifyCode, role: 'TEACHER' },
				});
	
				this.emailService.sendVerificationEmail(email, verifyCode)
					.catch(err => console.error('Ошибка отправки письма:', err));
			} catch (error) {
				console.error('Ошибка при создании пользователя:', error);
			}
		});
		return { message: 'Verification code sent to email' };
	}

	async verifyEmail(dto: VerifyEmailDto) {
		const user = await this.prisma.user.findUnique({ where: { email: dto.email } })
		if (!user || user.verifyCode !== dto.code) {
			throw new BadRequestException('Invalid verification code')
		}
		await this.prisma.user.update({
			where: { email: dto.email },
			data: { isVerified: true, verifyCode: null },
		})
		
		return { message: 'Email verified successfully' }
	}

	async login(dto: LoginDto, res: Response) {
		const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
		if (!user) {
			throw new UnauthorizedException('User not found');
		}
		const passValid = await bcrypt.compare(dto.password, user.password);
		if (!passValid) {
			throw new UnauthorizedException('Invalid credentials');
		}
		
		if (!user.isVerified) {
			throw new UnauthorizedException('Email not verified');
		}
		const token = this.jwtService.sign({ id: user.id, role: user.role });
		res.cookie('token', token, {
			httpOnly: true,
			secure: false,
			sameSite: 'lax',
		});
		return res.json({ message: 'Login successful', user: { id: user.id, name: user.name, email: user.email } })	;
	}

	async logout(res: Response) {
		res.clearCookie('token')
		return { message: 'Logged out' }
	}

	async getProfile(userId: string) {
		const user = await this.prisma.user.findUniqueOrThrow({
			where: { id: userId },
			select: { name: true, email: true, role: true },
		});
		return user;
	}

	// 📌 Обновление профиля (name, role)
	async updateProfile(userId: string, dto: UpdateProfileDto) {
		const { name} = dto;
		return this.prisma.user.update({
			where: { id: userId },
			data: { name},
			select: { name: true, email: true},
		});
	}

	// 📌 Запрос на сброс пароля
	async forgotPassword(email: string) {
		const resetCode = generateVerifyCode()
		const user = await this.prisma.user.update({
			where: { email },
			data: { verifyCode: resetCode },
			select: { id: true },
		}).catch(() => { throw new BadRequestException('User not found'); });
		this.emailService.sendVerificationEmail(email, resetCode);
		return { message: 'Password reset code sent' };
	}

	// 📌 Сброс пароля
	async resetPassword(dto: ResetPasswordDto) {
		const { email, code, newPassword } = dto;
		const hashedPassword = await bcrypt.hash(newPassword, 10);
		const user = await this.prisma.user.update({
			where: { email, verifyCode: code },
			data: { password: hashedPassword, verifyCode: null },
			select: { id: true },
		}).catch(() => { throw new BadRequestException('Invalid reset code'); });

		return { message: 'Password updated successfully' };
	}

	// 📌 Запрос на смену email
	async changeEmail(userId: string, dto: ChangeEmailDto) {
		const { newEmail } = dto;
		const existingUser = await this.prisma.user.findUnique({ where: { email: newEmail } });
		if (existingUser) throw new BadRequestException('Email already in use');
	
		const verifyCode = generateVerifyCode();
		await Promise.all([
			this.prisma.user.update({
				where: { id: userId },
				data: { verifyCode },
			}),
			this.emailService.sendVerificationEmail(newEmail, verifyCode),
		]);
	
		return { message: 'Verification code sent to new email' };
	}
	
	// 📌 Подтверждение смены email
	async changeEmailConfirm(userId: string, dto: ChangeEmailConfirmDto) {
		const { newEmail, code } = dto;
		return this.prisma.$transaction(async (prisma) => {
			// Проверяем пользователя и код
			const user = await prisma.user.findUnique({ where: { id: userId } });
			if (!user) throw new BadRequestException('User not found');
			if (user.verifyCode !== code) throw new BadRequestException('Invalid verification code');
			// Проверяем, не занят ли уже email
			const existingUser = await prisma.user.findUnique({ where: { email: newEmail } });
			if (existingUser) throw new BadRequestException('Email already in use');
			// Обновляем email и очищаем verifyCode
			await prisma.user.update({
				where: { id: userId },
				data: { email: newEmail, verifyCode: null },
			});
			return { message: 'Email updated successfully' };
		});
	}
}
