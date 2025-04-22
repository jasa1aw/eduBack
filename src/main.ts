import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  await app.listen(3000);
}
bootstrap();

// const correctCount = attemptAnswers.filter(a => a.isCorrect === true).length
	// const score = answers.length > 0 ? Math.round((correctCount / answers.length) * 100) : 0
