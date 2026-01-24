import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsBoolean, IsArray, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class AttendanceDataItemDto {
  @ApiProperty()
  @IsString()
  characterId: string;

  @ApiProperty()
  @IsBoolean()
  attended: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isReplacement?: boolean;
}

export class EventFeedbackDto {
  @ApiProperty({ description: "ID отряда или 'ALL' для всех отрядов сразу" })
  @IsString()
  squadId: string | 'ALL';

  @ApiProperty({ type: [AttendanceDataItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendanceDataItemDto)
  attendanceData: AttendanceDataItemDto[];
}
