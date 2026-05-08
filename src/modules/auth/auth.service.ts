import {
  Injectable,
  UnauthorizedException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import {
  RefreshToken,
  RefreshTokenDocument,
} from '../../database/schemas/refresh-token.schema';
import { UserDocument } from '../../database/schemas/user.schema';
import { Role } from '../../common/enums';
import { LoginDto, RegisterDto } from './dto';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private readonly SALT_ROUNDS = 12;

  constructor(
    private usersService: UsersService,
    private subscriptionsService: SubscriptionsService,
    private jwtService: JwtService,
    private configService: ConfigService,
    @InjectModel(RefreshToken.name)
    private refreshTokenModel: Model<RefreshTokenDocument>,
  ) {}

  async onModuleInit() {
    await this.seedAdminUser();
  }

  private async seedAdminUser() {
    const adminEmail = this.configService.get<string>('ADMIN_EMAIL');
    const adminPassword = this.configService.get<string>('ADMIN_PASSWORD');

    if (!adminEmail || !adminPassword) {
      this.logger.warn('ADMIN_EMAIL or ADMIN_PASSWORD not set in environment');
      return;
    }

    const result = await this.usersService.seedAdmin(adminEmail, adminPassword);

    if (result) {
      this.logger.log(`Admin user seeded: ${adminEmail}`);
    } else {
      this.logger.log('Admin user already exists, skipping seed');
    }
  }

  async login(loginDto: LoginDto, userAgent?: string, ipAddress?: string) {
    const user = await this.usersService.findByEmail(loginDto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User account is deactivated');
    }

    const isPasswordValid = await this.usersService.validatePassword(
      user,
      loginDto.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.generateTokens(user, userAgent, ipAddress);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: await this.buildAuthUser(user),
    };
  }

  async register(registerDto: RegisterDto) {
    const user = await this.usersService.create(
      registerDto.email,
      registerDto.password,
      Role.USER,
      registerDto.firstName,
      registerDto.lastName,
    );

    return this.buildAuthUser(user);
  }

  async getCurrentUser(userId: string) {
    const user = await this.usersService.findById(userId);

    if (!user || !user.isActive) {
      throw new UnauthorizedException(
        'Unauthorized: Please log in to continue.',
      );
    }

    return this.buildAuthUser(user);
  }

  async refresh(refreshToken: string | undefined) {
    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token provided');
    }
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      const storedTokens = await this.refreshTokenModel.find({
        userId: payload.sub,
        isRevoked: false,
      });

      if (!storedTokens.length) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      let storedToken: RefreshTokenDocument | null = null;
      for (const t of storedTokens) {
        if (await bcrypt.compare(refreshToken, t.tokenHash)) {
          storedToken = t;
          break;
        }
      }

      if (!storedToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      if (storedToken.expiresAt < new Date()) {
        throw new UnauthorizedException('Refresh token has expired');
      }

      storedToken.isRevoked = true;
      await storedToken.save();

      const user = await this.usersService.findById(payload.sub);

      if (!user || !user.isActive) {
        throw new UnauthorizedException('User not found or deactivated');
      }

      const tokens = await this.generateTokens(user);

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      await this.refreshTokenModel.updateMany(
        { userId: payload.sub, isRevoked: false },
        { isRevoked: true },
      );

      return { message: 'Successfully logged out' };
    } catch {
      return { message: 'Successfully logged out' };
    }
  }

  async revokeAllTokens(userId: string) {
    await this.refreshTokenModel.updateMany(
      { userId, isRevoked: false },
      { isRevoked: true },
    );
  }

  async saveFcmToken(userId: string, token: string): Promise<void> {
    await this.usersService.saveFcmToken(userId, token);
  }

  async clearFcmToken(userId: string): Promise<void> {
    await this.usersService.clearFcmToken(userId);
  }

  private async generateTokens(
    user: UserDocument,
    userAgent?: string,
    ipAddress?: string,
  ) {
    const payload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES') || '15m',
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES') || '7d',
    });

    const refreshExpiresIn = this.parseExpiration(
      this.configService.get<string>('JWT_REFRESH_EXPIRES') || '7d',
    );

    // Revoke all previous sessions — only one active session allowed at a time
    await this.refreshTokenModel.updateMany(
      { userId: user._id, isRevoked: false },
      { isRevoked: true },
    );

    const tokenHash = await bcrypt.hash(refreshToken, this.SALT_ROUNDS);

    await this.refreshTokenModel.create({
      userId: user._id,
      tokenHash,
      expiresAt: new Date(Date.now() + refreshExpiresIn),
      userAgent,
      ipAddress,
    });

    return { accessToken, refreshToken };
  }

  private parseExpiration(expiration: string): number {
    const match = expiration.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 7 * 24 * 60 * 60 * 1000;
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        return 7 * 24 * 60 * 60 * 1000;
    }
  }

  private sanitizeUser(user: UserDocument) {
    return {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      createdAt: user.createdAt,
    };
  }

  private async buildAuthUser(user: UserDocument) {
    const sanitizedUser = this.sanitizeUser(user);

    if (user.role === Role.ADMIN) {
      return sanitizedUser;
    }

    return {
      ...sanitizedUser,
      subscription: await this.subscriptionsService.getSubscriptionAccessState(
        user._id.toString(),
      ),
    };
  }
}
