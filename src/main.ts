import {NestFactory} from '@nestjs/core';
import {AppModule} from './app.module';
import {ValidationPipe} from '@nestjs/common';
import {DocumentBuilder, SwaggerModule} from '@nestjs/swagger';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    app.enableCors();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({whitelist: true, transform: true}));

    const config = new DocumentBuilder()
        .setTitle('PW Hub Claner API')
        .setDescription('Документация API для управления кланом в Perfect World. \n\n' +
            'Этот API позволяет управлять пользователями, персонажами, событиями клана и отслеживать активность.\n' +
            'Используется JWT авторизация.')
        .setVersion('1.0')
        .addBearerAuth()
        .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);

    const port = process.env.PORT || 3000;
    await app.listen(port);
    console.log(`Application is running on: ${await app.getUrl()}`);
    console.log(`Swagger documentation is available at: ${await app.getUrl()}/api/docs`);
}

bootstrap();
