import { NestFactory } from '@nestjs/core'
import * as cookieParser from 'cookie-parser'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.use(cookieParser())

  // Настройка CORS
  app.enableCors({
    origin: 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  })

  await app.listen(3001)
}
bootstrap()

// const correctCount = attemptAnswers.filter(a => a.isCorrect === true).length
// const score = answers.length > 0 ? Math.round((correctCount / answers.length) * 100) : 0
