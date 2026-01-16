import {Body, Controller, Get, Param, Patch, Post, Put, Query, Req, UseGuards} from '@nestjs/common';
import {UsersService} from './users.service';
import {CreateCharacterDto} from './dto/create-character.dto';
import {UpdateCharacterDto} from './dto/update-character.dto';
import {SwitchActiveCharacterDto} from './dto/switch-character.dto';
import {AuthGuard} from '@nestjs/passport';
import {ApiBearerAuth, ApiOperation, ApiResponse, ApiTags} from '@nestjs/swagger';

@ApiTags('Users')
@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) {
    }

    @Get('me')
    @ApiBearerAuth()
    @UseGuards(AuthGuard('jwt'))
    @ApiOperation({
        summary: 'Получение текущего пользователя',
        description: 'Возвращает информацию о пользователе и его персонажах'
    })
    @ApiResponse({status: 200, description: 'Данные пользователя'})
    getCurrentUser(@Req() req) {
        return this.usersService.findOrCreate(req.user);
    }

    @Get('public/characters/:id')
    @ApiOperation({ summary: 'Получение публичной информации о персонаже' })
    getPublicCharacter(@Param('id') id: string) {
        return this.usersService.getPublicCharacter(id);
    }

    @Post('me/otp')
    @ApiBearerAuth()
    @UseGuards(AuthGuard('jwt'))
    @ApiOperation({ summary: 'Генерация OTP для Telegram' })
    generateOtp(@Req() req) {
        return this.usersService.generateOtp(req.user.id);
    }

    @Patch('me/notifications')
    @ApiBearerAuth()
    @UseGuards(AuthGuard('jwt'))
    @ApiOperation({ summary: 'Обновление настроек уведомлений' })
    updateNotifications(@Req() req, @Body() dto: any) {
        return this.usersService.updateNotificationSettings(req.user.id, dto);
    }

    @Post('me/characters')
    @ApiBearerAuth()
    @UseGuards(AuthGuard('jwt'))
    @ApiOperation({summary: 'Создание нового персонажа', description: 'Добавляет персонажа к аккаунту'})
    @ApiResponse({status: 201, description: 'Персонаж создан'})
    createCharacter(@Req() req, @Body() dto: CreateCharacterDto) {
        return this.usersService.createCharacter(req.user.id, dto);
    }

    @Put('me/characters/:id')
    @ApiBearerAuth()
    @UseGuards(AuthGuard('jwt'))
    @ApiOperation({summary: 'Обновление персонажа', description: 'Обновляет данные персонажа'})
    @ApiResponse({status: 200, description: 'Персонаж обновлен'})
    updateCharacter(@Req() req, @Param('id') id: string, @Body() dto: UpdateCharacterDto) {
        return this.usersService.updateCharacter(req.user.id, id, dto);
    }

    @Put('me/active-character')
    @ApiBearerAuth()
    @UseGuards(AuthGuard('jwt'))
    @ApiOperation({summary: 'Смена активного персонажа', description: 'Устанавливает основного персонажа'})
    @ApiResponse({status: 200, description: 'Активный персонаж обновлен'})
    switchActiveCharacter(@Req() req, @Body() dto: SwitchActiveCharacterDto) {
        return this.usersService.switchActiveCharacter(req.user.id, dto.characterId);
    }

    @Get('me/permissions')
    @ApiBearerAuth()
    @UseGuards(AuthGuard('jwt'))
    @ApiOperation({summary: 'Получение прав', description: 'Возвращает список прав активного персонажа'})
    @ApiResponse({status: 200, description: 'Список прав'})
    getMyPermissions(@Req() req) {
        return this.usersService.getMyPermissions(req.user.id);
    }

    @Get('me/clan')
    @ApiBearerAuth()
    @UseGuards(AuthGuard('jwt'))
    @ApiOperation({summary: 'Получение клана', description: 'Возвращает информацию о клане активного персонажа'})
    @ApiResponse({status: 200, description: 'Информация о клане'})
    @ApiResponse({status: 404, description: 'Персонаж не состоит в клане'})
    getMyClan(@Req() req, @Query('weekIso') weekIso?: string) {
        return this.usersService.getMyClan(req.user.id, weekIso);
    }

    @Get('me/activity')
    @ApiBearerAuth()
    @UseGuards(AuthGuard('jwt'))
    @ApiOperation({summary: 'Получение активности', description: 'Возвращает данные об активности пользователя'})
    getMyActivity(@Req() req, @Query('week') week?: string) {
        return this.usersService.getMyActivity(req.user.id, week);
    }
}
