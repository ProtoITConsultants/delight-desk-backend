import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();

    const isDev = this.configService.get<string>('NODE_ENV') === 'development';

    if (isDev) {
      req.session.userId = this.configService.get<string>('DEV_USER_ID');
      return true;
    }

    if (!req.session?.userId) {
      throw new UnauthorizedException('Not authenticated');
    }

    return true;
  }
}
