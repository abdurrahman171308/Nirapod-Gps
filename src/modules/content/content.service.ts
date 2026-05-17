import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Content, ContentDocument, ContentType } from '../../database/schemas/content.schema';
import { CreateContentDto, UpdateContentDto } from './dto';

@Injectable()
export class ContentService {
  constructor(
    @InjectModel(Content.name) private contentModel: Model<ContentDocument>,
  ) {}

  async create(dto: CreateContentDto): Promise<ContentDocument> {
    return this.contentModel.create({
      ...dto,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    });
  }

  async findAll(type?: ContentType): Promise<ContentDocument[]> {
    const filter = type ? { type } : {};
    return this.contentModel.find(filter).sort({ createdAt: -1 }).select('-__v').lean() as unknown as ContentDocument[];
  }

  async findActive(type?: ContentType): Promise<ContentDocument[]> {
    const filter: Record<string, unknown> = { isActive: true };
    if (type) filter.type = type;
    return this.contentModel.find(filter).sort({ createdAt: -1 }).select('-__v').lean() as unknown as ContentDocument[];
  }

  async findOne(id: string): Promise<ContentDocument> {
    const item = await this.contentModel.findById(id).select('-__v');
    if (!item) throw new NotFoundException('Content item not found.');
    return item;
  }

  async update(id: string, dto: UpdateContentDto): Promise<ContentDocument> {
    const updateData: Record<string, unknown> = { ...dto };
    if (dto.startsAt) updateData.startsAt = new Date(dto.startsAt);
    if (dto.expiresAt) updateData.expiresAt = new Date(dto.expiresAt);

    const item = await this.contentModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .select('-__v');
    if (!item) throw new NotFoundException('Content item not found.');
    return item;
  }

  async remove(id: string): Promise<void> {
    const result = await this.contentModel.findByIdAndDelete(id);
    if (!result) throw new NotFoundException('Content item not found.');
  }
}
