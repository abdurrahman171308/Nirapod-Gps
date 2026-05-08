import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Coupon, CouponDocument } from '../../database/schemas/coupon.schema';
import { CreateCouponDto, UpdateCouponDto } from './dto';

@Injectable()
export class CouponsService {
  constructor(
    @InjectModel(Coupon.name) private couponModel: Model<CouponDocument>,
  ) {}

  async create(dto: CreateCouponDto): Promise<CouponDocument> {
    const code = dto.code.toUpperCase();
    const exists = await this.couponModel.findOne({ code });
    if (exists) {
      throw new ConflictException(`Coupon code '${code}' already exists.`);
    }

    return this.couponModel.create({
      ...dto,
      code,
      applicablePlans: dto.applicablePlans ?? [],
      expiresAt: new Date(dto.expiresAt),
    });
  }

  async findAll(): Promise<CouponDocument[]> {
    return this.couponModel.find().sort({ createdAt: -1 }).select('-__v').lean() as unknown as CouponDocument[];
  }

  async findOne(id: string): Promise<CouponDocument> {
    const coupon = await this.couponModel.findById(id).select('-__v');
    if (!coupon) {
      throw new NotFoundException('Coupon not found.');
    }
    return coupon;
  }

  async update(id: string, dto: UpdateCouponDto): Promise<CouponDocument> {
    const updateData: Partial<CouponDocument> = { ...(dto as any) };
    if (dto.expiresAt) {
      (updateData as any).expiresAt = new Date(dto.expiresAt);
    }

    const coupon = await this.couponModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .select('-__v');

    if (!coupon) {
      throw new NotFoundException('Coupon not found.');
    }
    return coupon;
  }

  async remove(id: string): Promise<void> {
    const result = await this.couponModel.findByIdAndDelete(id);
    if (!result) {
      throw new NotFoundException('Coupon not found.');
    }
  }
}
