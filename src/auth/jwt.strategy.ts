import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'

interface JwtPayload {
	id: string
	role: string
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
	constructor(private configService: ConfigService) {
		const jwtSecret = configService.get<string>('JWT_SECRET')
		if (!jwtSecret) {
			throw new Error('JWT_SECRET is not defined in the configuration')
		}

		super({
			jwtFromRequest: ExtractJwt.fromExtractors([(req) => req.cookies?.token]),
			secretOrKey: jwtSecret,
		})
	}

	async validate(payload: JwtPayload) {
		if (!payload || !payload.id || !payload.role) {
			throw new UnauthorizedException('Invalid token payload')
		}
		return { id: payload.id, role: payload.role }
	}
}
