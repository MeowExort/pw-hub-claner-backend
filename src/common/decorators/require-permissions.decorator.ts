import { SetMetadata } from '@nestjs/common';
import { ClanPermission } from '../constants/permissions';

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...permissions: ClanPermission[]) => SetMetadata(PERMISSIONS_KEY, permissions);
