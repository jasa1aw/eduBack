import { IsEmail, IsNotEmpty, MinLength, Length, IsOptional, IsEnum } from 'class-validator'

export class RegisterDto {
	@IsNotEmpty()
	@MinLength(2)
	name: string

	@IsEmail()
	email: string

	@MinLength(6)
	password: string
}

export class VerifyEmailDto {
	@IsEmail()
	email: string

	@Length(4, 4)
	code: string
}

export class LoginDto {
	@IsEmail()
	email: string

	@MinLength(6)
	password: string
}

export class UpdateProfileDto {
	@IsNotEmpty()
	@MinLength(2)
	name?: string
}

// DTO для сброса пароля
export class ForgotPasswordDto {
    @IsEmail()
    email: string;
}

export class ResetPasswordDto {
    @IsEmail()
    email: string;

    @Length(4, 4)
    code: string;

    @MinLength(6)
    newPassword: string;
}

export class ChangeEmailDto {
    @IsEmail()
    newEmail: string;
}

export class ChangeEmailConfirmDto extends ChangeEmailDto {
    @Length(4, 4)
    code: string;
}
