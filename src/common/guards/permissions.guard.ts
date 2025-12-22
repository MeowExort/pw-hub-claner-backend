import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { ClanPermission } from '../constants/permissions';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<ClanPermission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      // If AuthGuard didn't run or failed, this guard shouldn't necessarily block if it's a public route,
      // but usually PermissionsGuard is used after AuthGuard.
      // If no user, we can't check character permissions.
      // If permissions ARE required, then fail.
      if (requiredPermissions && requiredPermissions.length > 0) {
        return false;
      }
      return true;
    }

    // Fetch full user with mainCharacterId
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
    });

    if (!dbUser || !dbUser.mainCharacterId) {
      if (requiredPermissions && requiredPermissions.length > 0) {
        throw new BadRequestException('No active character selected');
      }
      return true;
    }

    // Fetch the character with clan info
    const character = await this.prisma.character.findUnique({
      where: { id: dbUser.mainCharacterId },
      include: { clan: true },
    });

    if (!character) {
      if (requiredPermissions && requiredPermissions.length > 0) {
        throw new BadRequestException('Active character not found');
      }
      return true;
    }

    // Attach character to request
    request.character = character;

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    // Check Clan Context
    if (!character.clanId || !character.clan) {
      throw new ForbiddenException('Character is not in a clan');
    }

    // Check Permissions
    const clanSettings = character.clan.settings as any;
    const role = character.clanRole;

    if (!role) {
      throw new ForbiddenException('Character has no role in clan');
    }

    // Master has all permissions
    if (role === 'MASTER') {
      return true;
    }

    const rolePermissions = clanSettings.rolePermissions?.find(
      (rp: any) => rp.role === role,
    );

    if (!rolePermissions) {
      // If no permissions defined for this role, deny
      throw new ForbiddenException('No permissions defined for this role');
    }

    const hasPermissions = requiredPermissions.every((permission) =>
      rolePermissions.permissions.includes(permission),
    );

    if (!hasPermissions) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
