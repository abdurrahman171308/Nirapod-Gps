import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { CookieOptions, Request, Response } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthService } from '../../modules/auth/auth.service';
import {
  getAccessCookieMaxAge,
  getAuthCookieBaseOptions,
  getRefreshCookieMaxAge,
} from '../utils';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly cookieOptions: CookieOptions;
  private readonly cookieMaxAge: number;
  private readonly refreshCookieMaxAge: number;

  /**
   * Per-refreshToken in-flight lock.
   * Key   = the raw refresh token string
   * Value = the Promise<{ accessToken, refreshToken }> that is already running
   *
   * When multiple requests arrive with the same expired access token at once,
   * the first one starts the refresh and stores its Promise here.
   * All subsequent ones await the same Promise instead of issuing a second
   * refresh call (which would fail because the refresh token was already rotated).
   */
  private readonly refreshLocks = new Map<
    string,
    Promise<{ accessToken: string; refreshToken: string }>
  >();

  constructor(
    private reflector: Reflector,
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    super();
    this.cookieOptions = getAuthCookieBaseOptions(configService);
    this.cookieMaxAge = getAccessCookieMaxAge(configService);
    this.refreshCookieMaxAge = getRefreshCookieMaxAge(configService);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const accessToken = req.cookies?.accessToken;
    const refreshToken = req.cookies?.refreshToken;

    const isLogout = req.method === 'POST' && req.path === '/auth/logout';

    if (refreshToken && !isLogout) {
      let shouldRefresh = !accessToken;

      if (accessToken) {
        try {
          const decoded = await this.jwtService.verifyAsync(accessToken, {
            secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
          });
          // Proactively refresh if token expires within 60 seconds
          const expiresInMs = decoded.exp * 1000 - Date.now();
          if (expiresInMs < 60_000) {
            shouldRefresh = true;
          }
        } catch (error: any) {
          shouldRefresh =
            error?.name === 'TokenExpiredError' ||
            error?.message === 'jwt expired';
        }
      }

      if (shouldRefresh) {
        try {
          // If another request is already refreshing with this same token,
          // wait for that result instead of calling refresh() a second time.
          let inflightRefresh = this.refreshLocks.get(refreshToken);

          if (!inflightRefresh) {
            inflightRefresh = this.authService.refresh(refreshToken).finally(() => {
              this.refreshLocks.delete(refreshToken);
            });
            this.refreshLocks.set(refreshToken, inflightRefresh);
          }

          const tokens = await inflightRefresh;
          this.setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

          req.cookies.accessToken = tokens.accessToken;
          req.cookies.refreshToken = tokens.refreshToken;
        } catch {
          // Refresh failed (token truly expired / revoked) — let passport throw 401.
        }
      }
    }

    return (await super.canActivate(context)) as boolean;
  }

  private setTokenCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ) {
    res.cookie('accessToken', accessToken, {
      ...this.cookieOptions,
      maxAge: this.cookieMaxAge,
    });

    res.cookie('refreshToken', refreshToken, {
      ...this.cookieOptions,
      maxAge: this.refreshCookieMaxAge,
    });
  }

  handleRequest(
    err: any,
    user: any,
    info: any,
    context: ExecutionContext,
    status?: any,
  ) {
    void info;
    void context;
    void status;
    if (err || !user) {
      throw (
        err ||
        new UnauthorizedException('Unauthorized: Please log in to continue.')
      );
    }
    return user;
  }
}
