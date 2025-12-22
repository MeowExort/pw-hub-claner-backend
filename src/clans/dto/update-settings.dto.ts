import { IsOptional, IsNumber, IsArray, IsString, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateClanSettingsDto {
    @ApiProperty({ required: false })
    @IsOptional()
    @IsArray()
    rolePermissions?: any[];

    @ApiProperty({ required: false })
    @IsOptional()
    @IsArray()
    customEvents?: any[];

    @ApiProperty({ required: false })
    @IsOptional()
    @IsNumber()
    pvpDefaultRallyOffsetMinutes?: number;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsObject()
    obligations?: any;
}

export class UpdateRolePermissionsDto {
    @ApiProperty()
    @IsString()
    role: string;

    @ApiProperty()
    @IsArray()
    @IsString({ each: true })
    permissions: string[];
}

export class AddCustomEventTemplateDto {
    @ApiProperty()
    @IsString()
    name: string;

    @ApiProperty()
    @IsString()
    icon: string;

    @ApiProperty()
    @IsString()
    description: string;
}

export class ChangeMemberRoleDto {
    @ApiProperty()
    @IsString()
    role: string;
}
