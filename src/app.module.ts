import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { PrismaService } from '@/prisma/prisma.service';
// import { MoService } from './mailer/mo/mo.service';
// import { SModule } from './mailer/s/s.module';
// import { MailerModule } from './mailer/email.module';

@Module({
  // imports: [
  //   ConfigModule.forRoot({ envFilePath: '.env', isGlobal: true }),
  // ],
  providers: [PrismaService],
  imports: [AuthModule],
})
export class AppModule {}
