import { IsNotEmpty, IsString, IsBoolean, IsOptional, IsInt, IsArray, ArrayNotEmpty } from 'class-validator'
import { QuestionType } from '@prisma/client'
import { PartialType } from '@nestjs/mapped-types'

export class QuestionDto {
	@IsOptional()
	@IsString()
	id?: string

	@IsString()
	@IsNotEmpty()
	text: string

	@IsArray()
	@IsOptional()
	options?: string[]

	@IsArray()
	@IsOptional()
	correctAnswers?: string[]

	@IsString()
	@IsOptional()
	explanation?: string

	@IsString()
	@IsOptional()
	image?: string

	@IsInt()
	@IsOptional()
	weight?: number

	@IsNotEmpty()
	type: QuestionType
}

export class CreateTestDto {
	@IsString()
	@IsNotEmpty()
	title: string

	@IsArray()
	@ArrayNotEmpty()
	questions: QuestionDto[]

	@IsBoolean()
	@IsOptional()
	isDraft?: boolean

	@IsInt()
	@IsOptional()
	maxAttempts?: number

	@IsInt()
	@IsOptional()
	timeLimit?: number

	@IsBoolean()
	@IsOptional()
	showAnswers?: boolean

	@IsInt()
	@IsOptional()
	weight?: number
}

export class UpdateTestDto {
	@IsString()
	@IsOptional()
	title?: string

	@IsArray()
	@IsOptional()
	questions?: QuestionDto[]

	@IsBoolean()
	@IsOptional()
	isDraft?: boolean

	@IsInt()
	@IsOptional()
	maxAttempts?: number

	@IsInt()
	@IsOptional()
	timeLimit?: number

	@IsBoolean()
	@IsOptional()
	showAnswers?: boolean
}

