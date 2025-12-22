
import { IsString, IsNumber, IsOptional, IsArray, Min, Max, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class KhRecordDto {
  @IsNumber()
  @Min(1)
  @Max(7)
  stage: number;

  @IsNumber()
  @Min(0)
  @Max(6)
  dayIndex: number;
}

export class UpdateWeeklyStatsDto {
  @IsString()
  characterId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KhRecordDto)
  @IsOptional()
  khRecords?: KhRecordDto[];

  @IsNumber()
  @IsOptional()
  rhythmValor?: number;

  @IsNumber()
  @IsOptional()
  zuCircles?: number;
}
