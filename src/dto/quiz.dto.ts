import { QuestionType } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateTestDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsBoolean()
  @IsNotEmpty()
  isDraft: boolean;

  @IsBoolean()
  @IsOptional()
  showAnswers?: boolean;

  @IsInt()
  @IsOptional()
  maxAttempts?: number;

  @IsInt()
  @IsOptional()
  timeLimit?: number;

  @IsBoolean()
  @IsOptional()
  examMode?: boolean;
}

export class AddQuestionDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsArray()
  @IsOptional()
  options?: string[];

  @IsArray()
  @IsOptional()
  correctAnswers?: string[];

  @IsString()
  @IsOptional()
  explanation?: string;

  @IsString()
  @IsOptional()
  image?: string;

  @IsInt()
  @IsOptional()
  weight?: number;

  @IsEnum(QuestionType)
  @IsNotEmpty()
  type: QuestionType;
}

export class UpdateTestDto extends PartialType(CreateTestDto) {
  @IsString()
  @IsOptional()
  title?: string;

  @IsBoolean()
  @IsOptional()
  isDraft?: boolean;

  @IsInt()
  @Min(1)
  @IsOptional()
  maxAttempts?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  timeLimit?: number;

  @IsBoolean()
  @IsOptional()
  showAnswers?: boolean;

  @IsBoolean()
  @IsOptional()
  examMode?: boolean;
}

export class UpdateQuestionDto extends PartialType(AddQuestionDto) {
  @IsString()
  @IsOptional()
  title?: string;

  @IsArray()
  @IsOptional()
  options?: string[];

  @IsArray()
  @IsOptional()
  correctAnswers?: string[];

  @IsString()
  @IsOptional()
  explanation?: string;

  @IsString()
  @IsOptional()
  image?: string;

  @IsInt()
  @IsOptional()
  weight?: number;

  @IsEnum(QuestionType)
  @IsOptional()
  type?: QuestionType;
}
