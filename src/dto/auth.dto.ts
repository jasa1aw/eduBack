import { IsEmail, IsNotEmpty, MinLength, Length } from 'class-validator'

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

