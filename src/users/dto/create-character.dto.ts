import { IsString, IsNumber, IsOptional, IsNotEmpty, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCharacterDto {
  @ApiProperty({ example: 'Nagibator2000', description: 'Имя персонажа' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Фенрир', description: 'Сервер' })
  @IsString()
  server: string;

  @ApiProperty({ example: 'Лучник', description: 'Класс персонажа' })
  @IsString()
  class: string;

  @ApiPropertyOptional({ example: 'https://pwobs.com/centaur/players/12345', description: 'Ссылка на pwobs' })
  @IsString()
  @IsOptional()
  @Matches(/^https:\/\/pwobs\.com\/[^/]+\/players\/[^/]+$/, { message: 'Ссылка должна быть формата https://pwobs.com/{server}/players/{id}' })
  pwobsLink?: string;

  @ApiPropertyOptional({ example: 15000, description: 'Мин. атака' })
  @IsNumber()
  @IsOptional()
  minAttack?: number;

  @ApiPropertyOptional({ example: 25000, description: 'Макс. атака' })
  @IsNumber()
  @IsOptional()
  maxAttack?: number;

  @ApiPropertyOptional({ example: 35, description: 'Шанс крита (%)' })
  @IsNumber()
  @IsOptional()
  critChance?: number;

  @ApiPropertyOptional({ example: 200, description: 'Крит. урон (%)' })
  @IsNumber()
  @IsOptional()
  critDamage?: number;

  @ApiPropertyOptional({ example: 1000, description: 'Боевой дух' })
  @IsNumber()
  @IsOptional()
  spirit?: number;

  @ApiPropertyOptional({ example: 1000, description: 'Физ. пробивание' })
  @IsNumber()
  @IsOptional()
  physPenetration?: number;

  @ApiPropertyOptional({ example: 1000, description: 'Маг. пробивание' })
  @IsNumber()
  @IsOptional()
  magPenetration?: number;

  @ApiPropertyOptional({ example: 10, description: 'Бонус уровня' })
  @IsNumber()
  @IsOptional()
  levelBonus?: number;

  @ApiPropertyOptional({ example: 50, description: 'Пение (%)' })
  @IsNumber()
  @IsOptional()
  chanting?: number;

  @ApiPropertyOptional({ example: 1.5, description: 'Атак/сек' })
  @IsNumber()
  @IsOptional()
  atkPerSec?: number;

  @ApiPropertyOptional({ example: 100, description: 'Па/Атака' })
  @IsNumber()
  @IsOptional()
  attackLevel?: number;

  @ApiPropertyOptional({ example: 30000, description: 'Здоровье' })
  @IsNumber()
  @IsOptional()
  health?: number;

  @ApiPropertyOptional({ example: 20000, description: 'Физ. защита' })
  @IsNumber()
  @IsOptional()
  physDef?: number;

  @ApiPropertyOptional({ example: 15000, description: 'Маг. защита' })
  @IsNumber()
  @IsOptional()
  magDef?: number;

  @ApiPropertyOptional({ example: 100, description: 'Пз/Защита' })
  @IsNumber()
  @IsOptional()
  defenseLevel?: number;

  @ApiPropertyOptional({ example: 50, description: 'Физ. уменьшение' })
  @IsNumber()
  @IsOptional()
  physReduction?: number;

  @ApiPropertyOptional({ example: 50, description: 'Маг. уменьшение' })
  @IsNumber()
  @IsOptional()
  magReduction?: number;
}
