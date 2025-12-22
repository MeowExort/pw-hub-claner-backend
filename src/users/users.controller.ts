import {Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards} from '@nestjs/common';
import {UsersService} from './users.service';
import {CreateCharacterDto} from './dto/create-character.dto';
import {UpdateCharacterDto} from './dto/update-character.dto';
import {SwitchActiveCharacterDto} from './dto/switch-character.dto';
import {AuthGuard} from '@nestjs/passport';
import {ApiBearerAuth, ApiOperation, ApiResponse, ApiTags} from '@nestjs/swagger';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users/me')
@UseGuards(AuthGuard('jwt'))
export class UsersController {
    constructor(private readonly usersService: UsersService) {
    }

    @Get()
    @ApiOperation({
        summary: 'Получение текущего пользователя',
        description: 'Возвращает информацию о пользователе и его персонажах'
    })
    @ApiResponse({status: 200, description: 'Данные пользователя'})
    getCurrentUser(@Req() req) {
        return this.usersService.findOrCreate(req.user);
    }

    @Post('characters')
    @ApiOperation({summary: 'Создание нового персонажа', description: 'Добавляет персонажа к аккаунту'})
    @ApiResponse({status: 201, description: 'Персонаж создан'})
    createCharacter(@Req() req, @Body() dto: CreateCharacterDto) {
        return this.usersService.createCharacter(req.user.id, dto);
    }

    @Put('characters/:id')
    @ApiOperation({summary: 'Обновление персонажа', description: 'Обновляет данные персонажа'})
    @ApiResponse({status: 200, description: 'Персонаж обновлен'})
    updateCharacter(@Req() req, @Param('id') id: string, @Body() dto: UpdateCharacterDto) {
        return this.usersService.updateCharacter(req.user.id, id, dto);
    }

    @Put('active-character')
    @ApiOperation({summary: 'Смена активного персонажа', description: 'Устанавливает основного персонажа'})
    @ApiResponse({status: 200, description: 'Активный персонаж обновлен'})
    switchActiveCharacter(@Req() req, @Body() dto: SwitchActiveCharacterDto) {
        return this.usersService.switchActiveCharacter(req.user.id, dto.characterId);
    }

    @Get('permissions')
    @ApiOperation({summary: 'Получение прав', description: 'Возвращает список прав активного персонажа'})
    @ApiResponse({status: 200, description: 'Список прав'})
    getMyPermissions(@Req() req) {
        return this.usersService.getMyPermissions(req.user.id);
    }

    @Get('clan')
    @ApiOperation({summary: 'Получение клана', description: 'Возвращает информацию о клане активного персонажа'})
    @ApiResponse({status: 200, description: 'Информация о клане'})
    @ApiResponse({status: 404, description: 'Персонаж не состоит в клане'})
    getMyClan(@Req() req, @Query('weekIso') weekIso?: string) {
        return this.usersService.getMyClan(req.user.id, weekIso);
    }

    @Get('activity')
    @ApiOperation({summary: 'Получение активности', description: 'Возвращает данные об активности пользователя'})
    getMyActivity(@Req() req, @Query('week') week?: string) {
        return this.usersService.getMyActivity(req.user.id, week);
    }
}
