import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { API_DEFAULT_PORT } from '@meeting-bingo/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());

  app.enableCors({
    origin: process.env.WEB_URL || 'http://localhost:3000',
    credentials: true,
  });

  const port = process.env.API_PORT ? parseInt(process.env.API_PORT, 10) : API_DEFAULT_PORT;
  await app.listen(port);
  console.log(`Meeting Bingo API running on port ${port}`);
}

bootstrap();
