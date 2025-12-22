import { IsArray, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LookupCharactersDto {
  @ApiProperty({ description: 'Список ID персонажей', type: [String] })
  @IsArray()
  @IsString({ each: true })
  ids: string[];
}
