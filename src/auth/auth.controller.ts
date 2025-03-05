import { Controller, Post, Body, Res, Req, UseGuards, Put, UnauthorizedException, Param } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, VerifyEmailDto, UpdateProfileDto, ForgotPasswordDto, ResetPasswordDto, ChangeEmailDto, ChangeEmailConfirmDto} from '@/src/dto/auth.dto';
import { Response, Request } from 'express';
import { JwtAuthGuard } from '@/src/auth/jwtAuth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }
  @Post('register-teacher')
  async registerForTeacher(@Body() dto: RegisterDto) {
    return this.authService.registerForTeacher(dto);
  }

  @Post('verify-email')
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Res() res: Response) {
    return this.authService.login(dto, res);
  }

  @Post('logout')
  async logout(@Res() res: Response) {
    return this.authService.logout(res);
  }

  @Post('protected')
  @UseGuards(JwtAuthGuard)
  async protectedRoute(@Req() req: Request) {
    return { message: `Hello, user !` };
  }

  @Put('profile')
	async updateProfile(@Req() req: Request, @Body() dto: UpdateProfileDto) {
		const token = req.cookies?.token;
		if (!token) throw new UnauthorizedException('Unauthorized');

		return this.authService.updateProfile(token, dto);
	}

	// Смена пароля (по email и коду)
	@Post('forgot-password')
    forgotPassword(@Body() { email }: ForgotPasswordDto) {
        return this.authService.forgotPassword(email);
    }

    @Post('reset-password')
    resetPassword(@Body() dto: ResetPasswordDto) {
        return this.authService.resetPassword(dto);
    }

    @Post('change-email/:userId')
    changeEmail(@Param('userId') userId: string, @Body() dto: ChangeEmailDto) {
        return this.authService.changeEmail(userId, dto);
    }

    @Post('change-email/confirm/:userId')
    changeEmailConfirm(@Param('userId') userId: string, @Body() dto: ChangeEmailConfirmDto) {
        return this.authService.changeEmailConfirm(userId, dto);
    }
	
}
