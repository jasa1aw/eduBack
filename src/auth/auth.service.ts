import { PrismaService } from '@/prisma/prisma.service'
import { generateVerifyCode } from '@/src/constanst/index'
import { ChangeEmailConfirmDto, ChangeEmailDto, LoginDto, RegisterDto, ResetPasswordDto, UpdateProfileDto, VerifyEmailDto } from '@/src/dto/auth.dto'
import { EmailService } from '@/src/email/email.service'
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import { Response } from 'express'

@Injectable()
export class AuthService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly jwtService: JwtService,
		private readonly emailService: EmailService,
		// private readonly mailerService: MailerService,
	) { }

	private async validateRegistrationInput(dto: RegisterDto) {
		// Проверка на пустые поля
		if (!dto.email || !dto.password || !dto.name) {
			throw new BadRequestException('Все поля обязательны для заполнения')
		}

		// Проверка формата email
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
		if (!emailRegex.test(dto.email)) {
			throw new BadRequestException('Неверный формат email')
		}

		// Проверка длины пароля
		if (dto.password.length < 6) {
			throw new BadRequestException('Пароль должен содержать минимум 6 символов')
		}

		// Проверка на существующего пользователя
		const existingUser = await this.prisma.user.findUnique({
			where: { email: dto.email },
		})
		if (existingUser) {
			throw new BadRequestException('Пользователь с таким email уже существует')
		}
	}

	private async validateLoginInput(dto: LoginDto) {
		// Проверка на пустые поля
		if (!dto.email || !dto.password) {
			throw new BadRequestException('Email и пароль обязательны')
		}

		// Проверка формата email
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
		if (!emailRegex.test(dto.email)) {
			throw new BadRequestException('Неверный формат email')
		}
	}

	private async createUserWithVerification(dto: RegisterDto, role: 'STUDENT' | 'TEACHER') {
		// Хеширование пароля
		const hashedPassword = await bcrypt.hash(dto.password, 10)

		// Генерация кода подтверждения
		const verifyCode = generateVerifyCode()

		// Создание пользователя в транзакции
		const user = await this.prisma.$transaction(async (prisma) => {
			const user = await prisma.user.create({
				data: {
					email: dto.email,
					password: hashedPassword,
					name: dto.name,
					role: role,
					isVerified: false,
					verifyCode,
				},
			})
			return user
		})

		// Отправка письма с подтверждением (асинхронно, без ожидания)
		this.emailService.sendVerificationEmail(dto.email, verifyCode)
			.catch(err => console.error('Ошибка отправки письма:', err))

		return user
	}

	async register(dto: RegisterDto) {
		// Проверка входных данных
		await this.validateRegistrationInput(dto)

		// Создание пользователя
		await this.createUserWithVerification(dto, 'STUDENT')

		return { message: 'Код подтверждения отправлен на email' }
	}

	async registerForTeacher(dto: RegisterDto) {
		// Проверка входных данных
		await this.validateRegistrationInput(dto)

		// Создание пользователя-учителя
		await this.createUserWithVerification(dto, 'TEACHER')

		return { message: 'Код подтверждения отправлен на email' }
	}

	async login(dto: LoginDto, res: Response) {
		// Проверка входных данных
		await this.validateLoginInput(dto)

		// Поиск пользователя
		const user = await this.prisma.user.findUnique({ where: { email: dto.email } })
		if (!user) {
			throw new UnauthorizedException('Неверный email или пароль')
		}

		// Проверка пароля
		const passValid = await bcrypt.compare(dto.password, user.password)
		if (!passValid) {
			throw new UnauthorizedException('Неверный email или пароль')
		}

		// Проверка подтверждения email
		if (!user.isVerified) {
			throw new UnauthorizedException('Email не подтвержден. Проверьте почту.')
		}

		// Генерация токена
		const token = this.jwtService.sign({ id: user.id, role: user.role })
		res.cookie('token', token, {
			httpOnly: true,
			secure: false,
			sameSite: 'lax',
		})

		return res.json({
			message: 'Вход выполнен успешно',
			user: {
				id: user.id,
				name: user.name,
				email: user.email,
				role: user.role,
			},
		})
	}

	async logout(res: Response) {
		res.clearCookie('token')
		return { message: 'Logged out' }
	}

	async verifyEmail(dto: VerifyEmailDto) {
		const user = await this.prisma.user.findUnique({ where: { email: dto.email } })
		if (!user || user.verifyCode !== dto.code) {
			throw new BadRequestException('Неверный код подтверждения')
		}

		// Обновление статуса подтверждения email
		await this.prisma.user.update({
			where: { id: user.id },
			data: {
				isVerified: true,
				verifyCode: null,
			},
		})

		return { message: 'Email успешно подтвержден' }
	}

	async getProfile(userId: string) {
		const user = await this.prisma.user.findUniqueOrThrow({
			where: { id: userId },
			select: {id: true, name: true, email: true, role: true },
		})
		return user
	}

	// 📌 Обновление профиля (name, role)
	async updateProfile(userId: string, dto: UpdateProfileDto) {
		const { name } = dto
		return this.prisma.user.update({
			where: { id: userId },
			data: { name },
			select: { name: true, email: true },
		})
	}

	// 📌 Запрос на сброс пароля
	async forgotPassword(email: string) {
		const user = await this.prisma.user.findUnique({
			where: { email },
			select: { id: true },
		})
		if (!user) throw new BadRequestException('User not found')

		const token = this.jwtService.sign(
			{ id: user.id, type: 'password_reset' },
			{ expiresIn: '1h' }
		)

		await this.emailService.sendPasswordReset(email, token)
		return { message: 'Password reset link sent ' }
	}

	// 📌 Сброс пароля
	async resetPassword(dto: ResetPasswordDto) {
		const { email, token, newPassword } = dto

		try {
			const payload = this.jwtService.verify(token)
			if (payload.type !== 'password_reset') {
				throw new BadRequestException('Invalid token type')
			}

			const hashedPassword = await bcrypt.hash(newPassword, 10)
			await this.prisma.user.update({
				where: { id: payload.id, email },
				data: { password: hashedPassword },
			})

			return { message: 'Password updated successfully' }
		} catch (error) {
			throw new BadRequestException('Invalid or expired token')
		}
	}

	// 📌 Запрос на смену email
	async changeEmail(userId: string, dto: ChangeEmailDto) {
		const { newEmail } = dto

		// Проверяем существование текущего пользователя
		const currentUser = await this.prisma.user.findUnique({ where: { id: userId } })
		if (!currentUser) throw new BadRequestException('User not found')

		// Проверяем, не пытается ли пользователь изменить email на тот же самый
		if (currentUser.email === newEmail) {
			throw new BadRequestException('New email must be different from current email')
		}

		// Проверяем, не занят ли новый email
		const existingUser = await this.prisma.user.findUnique({ where: { email: newEmail } })
		if (existingUser) throw new BadRequestException('Email already in use')

		// Генерируем токен с дополнительной информацией
		const token = this.jwtService.sign(
			{
				id: userId,
				currentEmail: currentUser.email,
				newEmail,
				type: 'email_change',
				iat: Math.floor(Date.now() / 1000)
			},
			{ expiresIn: '1h' }
		)

		// Отправляем письмо с подтверждением
		await this.emailService.sendEmailChangeVerification(newEmail, token)
		return { message: 'Verification link sent to new email' }
	}

	// 📌 Подтверждение смены email
	async changeEmailConfirm(dto: ChangeEmailConfirmDto) {
		const { token } = dto

		try {
			// Верифицируем токен
			const payload = this.jwtService.verify(token)
			if (payload.type !== 'email_change') {
				throw new BadRequestException('Invalid token type')
			}

			const newEmail = payload.newEmail

			// Проверяем, что токен не истек (дополнительная проверка)
			const now = Math.floor(Date.now() / 1000)
			if (now - payload.iat > 3600) { // 1 час в секундах
				throw new BadRequestException('Token has expired')
			}

			// Проверяем существование пользователя
			const user = await this.prisma.user.findUnique({ where: { id: payload.id } })
			if (!user) throw new BadRequestException('User not found')

			// Проверяем, что текущий email пользователя совпадает с тем, что в токене
			if (user.email !== payload.currentEmail) {
				throw new BadRequestException('Email verification failed')
			}

			// Проверяем, не занят ли новый email (дополнительная проверка)
			const existingUser = await this.prisma.user.findUnique({ where: { email: newEmail } })
			if (existingUser) throw new BadRequestException('Email already in use')

			// Обновляем email в транзакции
			await this.prisma.$transaction(async (prisma) => {
				await prisma.user.update({
					where: { id: payload.id },
					data: { email: newEmail },
				})
			})

			return { message: 'Email updated successfully' }
		} catch (error) {
			if (error instanceof BadRequestException) {
				throw error
			}
			throw new BadRequestException('Invalid or expired token')
		}
	}
}