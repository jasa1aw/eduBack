import { PrismaService } from '@/prisma/prisma.service'
import { LoginDto, RegisterDto, VerifyEmailDto } from '@/src/dto/auth.dto'
import { EmailService } from '@/src/email/email.service'
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import * as argon2 from 'argon2';
import { Response } from 'express'

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

		// const hsPass = await bcrypt.hash(password, 10)		
		
		// const verifyCode = Math.floor(1000 + Math.random() * 9000).toString()

		// const user = await this.prisma.user.create({
		// 	data: { name, email, password: hsPass, verifyCode },
		// })

		// // await this.emailService.sendVerificationEmail(user.email, verifyCode)
		// this.emailService.sendVerificationEmail(user.email, verifyCode)
        // 	.catch(err => console.error('Ошибка отправки письма:', err));

		setImmediate(async () => {
			try {
				const hashedPassword = await bcrypt.hash(password, 10);
				const verifyCode = Math.floor(1000 + Math.random() * 9000).toString();
	
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
		console.time('⏳ Полный логин');
		console.time('🔍 Поиск пользователя');
		const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
		console.timeEnd('🔍 Поиск пользователя');
		if (!user) {
			throw new UnauthorizedException('User not found');
		}
		console.time('🔐 Проверка пароля');
		const passValid = await bcrypt.compare(dto.password, user.password);
		console.timeEnd('🔐 Проверка пароля');
		if (!passValid) {
			throw new UnauthorizedException('Invalid credentials');
		}
		
		if (!user.isVerified) {
			throw new UnauthorizedException('Email not verified');
		}
		console.time('🔑 Создание токена');
		const token = this.jwtService.sign({ id: user.id, role: user.role });
		console.timeEnd('🔑 Создание токена');

		console.time('🍪 Установка куки');
		res.cookie('token', token, {
			httpOnly: true,
			secure: false,
			sameSite: 'lax',
		});
		console.timeEnd('🍪 Установка куки');
	
		console.timeEnd('⏳ Полный логин');
		return res.json({ message: 'Login successful', user: { id: user.id, name: user.name, email: user.email } })	;
	}

	async logout(res: Response) {
		res.clearCookie('token')
		return { message: 'Logged out' }
	}
}
