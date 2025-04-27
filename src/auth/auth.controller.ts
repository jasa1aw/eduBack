import { JwtAuthGuard } from '@/src/auth/jwtAuth.guard'
import { ChangeEmailConfirmDto, ChangeEmailDto, ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto, UpdateProfileDto, VerifyEmailDto } from '@/src/dto/auth.dto'
import { Body, Controller, Get, Param, Post, Put, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common'
import { Request, Response } from 'express'
import { AuthService } from './auth.service'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto)
  }
  @Post('register-teacher')
  async registerForTeacher(@Body() dto: RegisterDto) {
    return this.authService.registerForTeacher(dto)
  }

  @Post('verify-email')
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto)
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Res() res: Response) {
    return this.authService.login(dto, res)
  }

  @Post('logout')
  async logout(@Res() res: Response) {
    return this.authService.logout(res)
  }

  @Post('protected')
  @UseGuards(JwtAuthGuard)
  async protectedRoute(@Req() req: Request) {
    return { message: `Hello, user !` }
  }

  @Get('me/:userId')
  getProfile(@Param('userId') userId: string) {
    return this.authService.getProfile(userId)
  }

  @Put('profile')
  async updateProfile(@Req() req: Request, @Body() dto: UpdateProfileDto) {
    const token = req.cookies?.token
    if (!token) throw new UnauthorizedException('Unauthorized')

    return this.authService.updateProfile(token, dto)
  }

  // Смена пароля (по email и коду)
  @Post('forgot-password')
  forgotPassword(@Body() { email }: ForgotPasswordDto) {
    return this.authService.forgotPassword(email)
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto)
  }

  @Post('change-email/:userId')
  changeEmail(@Param('userId') userId: string, @Body() dto: ChangeEmailDto) {
    return this.authService.changeEmail(userId, dto)
  }

  @Post('change-email/confirm')
  changeEmailConfirm(@Body() dto: ChangeEmailConfirmDto) {
    return this.authService.changeEmailConfirm(dto)
  }

}
