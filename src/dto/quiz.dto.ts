import { IsNotEmpty, IsString, IsBoolean, IsOptional, IsInt, IsArray, ArrayNotEmpty, ValidateNested } from 'class-validator'
import { QuestionType } from '@prisma/client'
import { Type } from 'class-transformer'

export class AddQuestionDto {
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

export class UpdateQuestionDto {
	@IsString()
	@IsOptional()
	id?: string // Добавляем ID, чтобы понимать, какие вопросы обновлять

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

export class UpdateTestDto {
	@IsString()
	@IsOptional()
	title?: string

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

	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => UpdateQuestionDto)
	@IsOptional()
	questions?: UpdateQuestionDto[]
}