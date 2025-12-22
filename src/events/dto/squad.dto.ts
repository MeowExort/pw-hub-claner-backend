import { IsArray, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SquadDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    id?: string;
    
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    name?: string;
    
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    leaderId?: string;
    
    @ApiPropertyOptional()
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    members?: string[];
}
