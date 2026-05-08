import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { Role } from '../../common/enums/roles.enum';

@Injectable()
export class UsersService {
  private readonly SALT_ROUNDS = 12;

  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  async findById(id: string | Types.ObjectId): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async create(
    email: string,
    password: string,
    role: Role = Role.USER,
    firstName?: string,
    lastName?: string,
  ): Promise<UserDocument> {
    const existingUser = await this.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, this.SALT_ROUNDS);

    const user = new this.userModel({
      email: email.toLowerCase(),
      passwordHash,
      role,
      firstName,
      lastName,
      isActive: true,
    });

    return user.save();
  }

  async validatePassword(
    user: UserDocument,
    password: string,
  ): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }

  async countAdmins(): Promise<number> {
    return this.userModel
      .countDocuments({ role: Role.ADMIN, isActive: true })
      .exec();
  }

  async seedAdmin(
    email: string,
    password: string,
  ): Promise<UserDocument | null> {
    const adminCount = await this.countAdmins();

    if (adminCount > 0) {
      return null;
    }

    const existingUser = await this.findByEmail(email);
    if (existingUser) {
      if (existingUser.role !== Role.ADMIN) {
        existingUser.role = Role.ADMIN;
        return existingUser.save();
      }
      return existingUser;
    }

    return this.create(email, password, Role.ADMIN);
  }

  async deactivateUser(id: string): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(id, { isActive: false }, { new: true })
      .exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async updatePassword(userId: string, newPassword: string): Promise<void> {
    const passwordHash = await bcrypt.hash(newPassword, this.SALT_ROUNDS);
    await this.userModel.findByIdAndUpdate(userId, { passwordHash }).exec();
  }

  async updateProfile(
    userId: string,
    firstName?: string,
    lastName?: string,
  ): Promise<UserDocument> {
    const update: any = {};
    if (firstName !== undefined) update.firstName = firstName;
    if (lastName !== undefined) update.lastName = lastName;

    const user = await this.userModel
      .findByIdAndUpdate(userId, update, { new: true })
      .exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.userModel.findById(userId).exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(newPassword, this.SALT_ROUNDS);
    await this.userModel.findByIdAndUpdate(userId, { passwordHash }).exec();
  }

  async findAll(): Promise<UserDocument[]> {
    return this.userModel.find().sort({ createdAt: -1 }).exec();
  }

  async setActiveStatus(id: string, isActive: boolean): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(id, { isActive }, { new: true })
      .exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async saveFcmToken(userId: string, token: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { fcmToken: token }).exec();
  }

  async clearFcmToken(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { $unset: { fcmToken: 1 } }).exec();
  }

  async getFcmTokenByUserId(userId: string): Promise<string | null> {
    const user = await this.userModel.findById(userId).select('fcmToken').lean().exec();
    return user?.fcmToken ?? null;
  }
}
