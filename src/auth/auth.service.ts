import { PrismaService } from '@/prisma/prisma.service';
import { generateVerifyCode } from '@/src/constanst/index';
import {
  ChangeEmailConfirmDto,
  ChangeEmailDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  UpdateProfileDto,
  VerifyEmailDto,
} from '@/src/dto/auth.dto';
import { EmailService } from '@/src/email/email.service';
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Response } from 'express';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  private async validateRegistrationInput(
    dto: RegisterDto,
    role?: 'STUDENT' | 'TEACHER',
  ) {
    if (!dto.email || !dto.password || !dto.name) {
      throw new BadRequestException('Все поля обязательны для заполнения');
    }
    if (role === 'TEACHER' && !dto.institution) {
      throw new BadRequestException(
        'Поле Учебное заведение обязательно для учителей',
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(dto.email)) {
      throw new BadRequestException('Неверный формат email');
    }
    if (dto.password.length < 6) {
      throw new BadRequestException(
        'Пароль должен содержать минимум 6 символов',
      );
    }
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw new BadRequestException(
        'Пользователь с таким email уже существует',
      );
    }
  }

  private async validateLoginInput(dto: LoginDto) {
    if (!dto.email || !dto.password) {
      throw new BadRequestException('Email и пароль обязательны');
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(dto.email)) {
      throw new BadRequestException('Неверный формат email');
    }
  }

  private async createUserWithVerification(
    dto: RegisterDto,
    role: 'STUDENT' | 'TEACHER',
  ) {
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const verifyCode = generateVerifyCode();

    const user = await this.prisma.$transaction(async (prisma) => {
      const user = await prisma.user.create({
        data: {
          email: dto.email,
          password: hashedPassword,
          name: dto.name,
          role: role,
          institution: dto.institution || null,
          isVerified: false,
          verifyCode,
        },
      });
      return user;
    });

    this.emailService
      .sendVerificationEmail(dto.email, verifyCode)
      .catch((err) => console.error('Ошибка отправки письма:', err));

    return user;
  }

  async register(dto: RegisterDto) {
    await this.validateRegistrationInput(dto, 'STUDENT');

    await this.createUserWithVerification(dto, 'STUDENT');

    return { message: 'Код подтверждения отправлен на email' };
  }

  async registerForTeacher(dto: RegisterDto) {
    await this.validateRegistrationInput(dto, 'TEACHER');

    await this.createUserWithVerification(dto, 'TEACHER');

    return { message: 'Код подтверждения отправлен на email' };
  }

  async login(dto: LoginDto, res: Response) {
    await this.validateLoginInput(dto);

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    const passValid = await bcrypt.compare(dto.password, user.password);
    if (!passValid) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    if (!user.isVerified) {
      throw new UnauthorizedException('Email не подтвержден. Проверьте почту.');
    }

    const token = this.jwtService.sign(
      { id: user.id, role: user.role },
      { expiresIn: '30d' },
    );
    res.cookie('token', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      message: 'Вход выполнен успешно',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        institution: user.institution,
      },
      token: token,
    });
  }

  async logout(res: Response) {
    res.clearCookie('token');
    return res.json({
      message: 'Logged out',
    });
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user || user.verifyCode !== dto.code) {
      throw new BadRequestException('Неверный код подтверждения');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verifyCode: null,
      },
    });

    return { message: 'Email успешно подтвержден' };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        institution: true,
      },
    });
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const { name, institution } = dto;
    const updateData: any = {};

    if (name !== undefined) updateData.name = name;
    if (institution !== undefined) updateData.institution = institution;

    return this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: { name: true, email: true, institution: true, role: true },
    });
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!user) throw new BadRequestException('User not found');

    const token = this.jwtService.sign(
      { id: user.id, type: 'password_reset' },
      { expiresIn: '1h' },
    );

    await this.emailService.sendPasswordReset(email, token);
    return { message: 'Password reset link sent ' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const { email, token, newPassword } = dto;

    try {
      const payload = this.jwtService.verify(token);
      if (payload.type !== 'password_reset') {
        throw new BadRequestException('Invalid token type');
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await this.prisma.user.update({
        where: { id: payload.id, email },
        data: { password: hashedPassword },
      });

      return { message: 'Password updated successfully' };
    } catch (error) {
      throw new BadRequestException('Invalid or expired token');
    }
  }

  async changeEmail(userId: string, dto: ChangeEmailDto) {
    const { newEmail } = dto;

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!currentUser) throw new BadRequestException('User not found');

    if (currentUser.email === newEmail) {
      throw new BadRequestException(
        'New email must be different from current email',
      );
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: newEmail },
    });
    if (existingUser) throw new BadRequestException('Email already in use');

    const token = this.jwtService.sign(
      {
        id: userId,
        currentEmail: currentUser.email,
        newEmail,
        type: 'email_change',
        iat: Math.floor(Date.now() / 1000),
      },
      { expiresIn: '1h' },
    );
    await this.emailService.sendEmailChangeVerification(newEmail, token);
    return { message: 'Verification link sent to new email' };
  }

  async changeEmailConfirm(dto: ChangeEmailConfirmDto) {
    const { token } = dto;

    try {
      const payload = this.jwtService.verify(token);
      if (payload.type !== 'email_change') {
        throw new BadRequestException('Invalid token type');
      }
      const newEmail = payload.newEmail;
      const now = Math.floor(Date.now() / 1000);
      if (now - payload.iat > 3600) {
        throw new BadRequestException('Token has expired');
      }
      const user = await this.prisma.user.findUnique({
        where: { id: payload.id },
      });
      if (!user) throw new BadRequestException('User not found');
      if (user.email !== payload.currentEmail) {
        throw new BadRequestException('Email verification failed');
      }
      const existingUser = await this.prisma.user.findUnique({
        where: { email: newEmail },
      });
      if (existingUser) throw new BadRequestException('Email already in use');
      await this.prisma.$transaction(async (prisma) => {
        await prisma.user.update({
          where: { id: payload.id },
          data: { email: newEmail },
        });
      });

      return { message: 'Email updated successfully' };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Invalid or expired token');
    }
  }
}
