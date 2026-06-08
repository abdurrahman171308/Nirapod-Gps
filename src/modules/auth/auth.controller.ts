import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
  ApiBody,
} from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CookieOptions, Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, SessionTokenDto } from './dto';
import { CurrentUser, Public } from '../../common/decorators';
import {
  getAccessCookieMaxAge,
  getAuthCookieBaseOptions,
  getRefreshCookieMaxAge,
} from '../../common/utils';

class RegisterFcmTokenDto {
  @ApiProperty({ example: 'fcm-device-token-xyz', description: 'FCM device token from the mobile app' })
  @IsString()
  @IsNotEmpty()
  token!: string;
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  private readonly cookieOptions: CookieOptions;
  private readonly cookieMaxAge: number;
  private readonly refreshCookieMaxAge: number;

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    this.cookieOptions = getAuthCookieBaseOptions(configService);
    this.cookieMaxAge = getAccessCookieMaxAge(configService);
    this.refreshCookieMaxAge = getRefreshCookieMaxAge(configService);
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

  private clearTokenCookies(res: Response) {
    res.clearCookie('accessToken', this.cookieOptions);
    res.clearCookie('refreshToken', this.cookieOptions);
  }

  private getRefreshToken(req: Request, dto?: SessionTokenDto): string | undefined {
    return req.cookies?.refreshToken || dto?.refreshToken;
  }

  @Post('register')
  @Public()
  @ApiOperation({ summary: 'Register normal user account' })
  @ApiResponse({
    status: 201,
    description: 'User account created successfully',
    schema: {
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            role: { type: 'string', example: 'USER' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            isActive: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            subscription: {
              type: 'object',
              properties: {
                assignedDeviceCount: { type: 'number', example: 2 },
                pricePerDevice: { type: 'number', example: 300 },
                expectedMonthlyAmount: { type: 'number', example: 600 },
                expectedYearlyAmount: { type: 'number', example: 7200 },
                hasActiveSubscription: { type: 'boolean', example: false },
                subscriptionRequired: { type: 'boolean', example: true },
                shouldPromptSubscription: { type: 'boolean', example: true },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'User with this email already exists',
  })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Get('me')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Get current logged-in user profile' })
  @ApiResponse({
    status: 200,
    description: 'Current user profile fetched successfully',
    schema: {
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            role: { type: 'string' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            isActive: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            subscription: {
              type: 'object',
              properties: {
                assignedDeviceCount: { type: 'number', example: 2 },
                pricePerDevice: { type: 'number', example: 300 },
                expectedMonthlyAmount: { type: 'number', example: 600 },
                expectedYearlyAmount: { type: 'number', example: 7200 },
                hasActiveSubscription: { type: 'boolean', example: false },
                subscriptionRequired: { type: 'boolean', example: true },
                shouldPromptSubscription: { type: 'boolean', example: true },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized: Please log in to continue.',
  })
  async me(@CurrentUser('userId') userId: string) {
    return this.authService.getCurrentUser(userId);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'User login' })
  @ApiResponse({
    status: 200,
    description: 'Login successful - tokens set in HTTP-only cookies',
    schema: {
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                role: { type: 'string' },
                subscription: {
                  type: 'object',
                  properties: {
                    assignedDeviceCount: { type: 'number', example: 2 },
                    pricePerDevice: { type: 'number', example: 300 },
                    expectedMonthlyAmount: { type: 'number', example: 600 },
                    expectedYearlyAmount: { type: 'number', example: 7200 },
                    hasActiveSubscription: { type: 'boolean', example: false },
                    subscriptionRequired: { type: 'boolean', example: true },
                    shouldPromptSubscription: { type: 'boolean', example: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userAgent = req.headers['user-agent'];
    const ipAddress =
      (req.headers['x-forwarded-for'] as string) ||
      req.socket.remoteAddress ||
      '';

    const result = await this.authService.login(loginDto, userAgent, ipAddress);

    this.setTokenCookies(res, result.accessToken, result.refreshToken);

    return {
      user: result.user,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using cookie or request body' })
  @ApiBody({ type: SessionTokenDto, required: false })
  @ApiResponse({
    status: 200,
    description: 'Tokens refreshed successfully',
    schema: {
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
          },
        },
      },
    },
  })
  async refresh(
    @Req() req: Request,
    @Body() dto: SessionTokenDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.refresh(this.getRefreshToken(req, dto));
    this.setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
    return { message: 'Tokens refreshed successfully' };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'User logout - clears HTTP-only cookies' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  @ApiBody({ type: SessionTokenDto, required: false })
  async logout(
    @Req() req: Request,
    @Body() dto: SessionTokenDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = this.getRefreshToken(req, dto);

    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }

    this.clearTokenCookies(res);

    return { message: 'Successfully logged out' };
  }

  @Put('fcm-token')
  @ApiCookieAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register or update FCM device token for push notifications' })
  @ApiBody({ type: RegisterFcmTokenDto })
  @ApiResponse({ status: 200, description: 'FCM token saved' })
  async registerFcmToken(
    @CurrentUser('userId') userId: string,
    @Body() dto: RegisterFcmTokenDto,
  ) {
    await this.authService.saveFcmToken(userId, dto.token);
    return { message: 'FCM token registered successfully.' };
  }

  @Delete('fcm-token')
  @ApiCookieAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove FCM device token (e.g. on logout from a specific device)' })
  @ApiResponse({ status: 200, description: 'FCM token removed' })
  async removeFcmToken(@CurrentUser('userId') userId: string) {
    await this.authService.clearFcmToken(userId);
    return { message: 'FCM token removed successfully.' };
  }
}
