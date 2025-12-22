import { IsString, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum RsvpStatus {
    GOING = 'GOING',
    NOT_GOING = 'NOT_GOING',
    UNDECIDED = 'UNDECIDED'
}

export class RsvpDto {
    @ApiProperty()
    @IsString()
    characterId: string;

    @ApiProperty({ enum: RsvpStatus })
    @IsEnum(RsvpStatus)
    status: RsvpStatus;
}
