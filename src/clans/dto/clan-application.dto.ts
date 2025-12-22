import { IsString, IsNotEmpty, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateApplicationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
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
