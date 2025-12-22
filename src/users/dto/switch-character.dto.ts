import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SwitchActiveCharacterDto {
  @ApiProperty({ example: 'uuid-of-character', description: 'ID персонажа, на которого нужно переключиться' })
  @IsString()
  characterId: string;
}
