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
import { UpdateAddressDto } from './dto/update-profile.dto';
import { Role } from '../../common/enums/roles.enum';

@Injectable()
export class UsersService {
  private readonly SALT_ROUNDS = 12;

  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  async findByUsername(username: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } })
      .exec();
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
    username?: string,
    phone?: string,
    address?: UpdateAddressDto,
  ): Promise<UserDocument> {
    const existingEmail = await this.findByEmail(email);
    if (existingEmail) {
      throw new ConflictException('User with this email already exists');
    }

    if (username) {
      const existingUsername = await this.findByUsername(username);
      if (existingUsername) {
        throw new ConflictException('This username is already taken');
      }
    }

    const passwordHash = await bcrypt.hash(password, this.SALT_ROUNDS);

    const user = new this.userModel({
      email: email.toLowerCase(),
      username: username?.toLowerCase(),
      passwordHash,
      role,
      firstName,
      lastName,
      phone,
      address,
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
    username?: string,
  ): Promise<UserDocument | null> {
    const existingUser = await this.findByEmail(email);

    if (existingUser) {
      let dirty = false;
      if (existingUser.role !== Role.ADMIN) {
        existingUser.role = Role.ADMIN;
        dirty = true;
      }
      // Patch username onto existing admin if it is missing
      if (username && !existingUser.username) {
        existingUser.username = username.toLowerCase();
        dirty = true;
      }
      return dirty ? existingUser.save() : existingUser;
    }

    return this.create(email, password, Role.ADMIN, undefined, undefined, username);
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
    phone?: string,
    address?: UpdateAddressDto,
  ): Promise<UserDocument> {
    const update: Partial<{
      firstName: string;
      lastName: string;
      phone: string;
      address: UpdateAddressDto;
    }> = {};
    if (firstName !== undefined) update.firstName = firstName;
    if (lastName !== undefined) update.lastName = lastName;
    if (phone !== undefined) update.phone = phone;
    if (address !== undefined) update.address = address;

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

  async adminUpdateUser(
    id: string,
    data: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      address?: UpdateAddressDto;
    },
  ): Promise<UserDocument> {
    const update: Partial<typeof data> = {};
    if (data.firstName !== undefined) update.firstName = data.firstName;
    if (data.lastName !== undefined) update.lastName = data.lastName;
    if (data.phone !== undefined) update.phone = data.phone;
    if (data.address !== undefined) update.address = data.address;

    const user = await this.userModel
      .findByIdAndUpdate(id, update, { new: true })
      .exec();

    if (!user) throw new NotFoundException('User not found');
    return user;
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
