import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { CharactersController } from './characters.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController, CharactersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
