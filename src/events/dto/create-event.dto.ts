import { IsString, IsNotEmpty, IsEnum, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum EventType {
    SADEMAN = 'SADEMAN',
    MTV = 'MTV',
    GVG = 'GVG',
    CUSTOM = 'CUSTOM'
}

export class CreateEventDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: EventType })
  @IsEnum(EventType)
  type: string;

  @ApiProperty()
  @IsDateString()
  date: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  rallyTime?: string;
  
  @ApiProperty({ required: false })
  @IsOptional()
  opponent?: any; 
}
