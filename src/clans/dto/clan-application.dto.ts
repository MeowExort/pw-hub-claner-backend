import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateApplicationDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  message: string;
}

export enum ApplicationDecision {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT'
}

export class UpdateApplicationDto {
  @ApiProperty({ enum: ApplicationDecision })
  @IsEnum(ApplicationDecision)
  decision: ApplicationDecision;
}
