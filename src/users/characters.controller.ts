import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { LookupCharactersDto } from './dto/lookup-characters.dto';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';

@ApiTags('Characters')
@Controller('characters')
export class CharactersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('lookup')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Получение имен персонажей по ID', description: 'Возвращает мапу {id: {name, class}}' })
  @ApiResponse({ status: 200, description: 'Мапа имен' })
  lookupCharacters(@Body() dto: LookupCharactersDto) {
    return this.usersService.resolveCharacterNames(dto.ids);
  }
}
