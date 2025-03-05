import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

@Injectable()
export class RoleGuard implements CanActivate {
	constructor(private reflector: Reflector) { }

	canActivate(context: ExecutionContext): boolean {
		const requiredRoles = this.reflector.get<string[]>('roles', context.getHandler())
		if (!requiredRoles) return true

		const { user } = context.switchToHttp().getRequest()
		if (!user || !requiredRoles.includes(user.role)) {
			throw new ForbiddenException('You do not have permission')
		}

		return true
	}
}
