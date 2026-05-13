import {
  Injectable,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Division,
  DivisionDocument,
} from '../../database/schemas/division.schema';
import {
  District,
  DistrictDocument,
} from '../../database/schemas/district.schema';
import {
  Upazila,
  UpazilaDocument,
} from '../../database/schemas/upazila.schema';

@Injectable()
export class AddressService {
  constructor(
    @InjectModel(Division.name) private divisionModel: Model<DivisionDocument>,
    @InjectModel(District.name) private districtModel: Model<DistrictDocument>,
    @InjectModel(Upazila.name) private upazilaModel: Model<UpazilaDocument>,
  ) {}

  async seedAddress(
    divisions: any[],
    districts: any[],
    upazilas: any[],
  ): Promise<{ divisions: number; districts: number; upazilas: number }> {
    const [divCount, disCount, upCount] = await Promise.all([
      this.divisionModel.countDocuments(),
      this.districtModel.countDocuments(),
      this.upazilaModel.countDocuments(),
    ]);

    if (divCount > 0 || disCount > 0 || upCount > 0) {
      throw new ConflictException(
        'Address data already exists. Drop collections first to re-seed.',
      );
    }

    if (!divisions?.length || !districts?.length || !upazilas?.length) {
      throw new BadRequestException(
        'divisions, districts, and upazilas arrays are all required and must be non-empty.',
      );
    }

    await this.divisionModel.insertMany(divisions, { ordered: false });
    await this.districtModel.insertMany(districts, { ordered: false });
    await this.upazilaModel.insertMany(upazilas, { ordered: false });

    return {
      divisions: divisions.length,
      districts: districts.length,
      upazilas: upazilas.length,
    };
  }

  async getDivisions(): Promise<Division[]> {
    return this.divisionModel.find({}, { createdAt: 0, updatedAt: 0, __v: 0 }).sort({ name: 1 });
  }

  async getDistrictsByDivision(divisionId: number): Promise<District[]> {
    return this.districtModel
      .find({ division_id: divisionId }, { createdAt: 0, updatedAt: 0, __v: 0 })
      .sort({ name: 1 });
  }

  async getUpazilasByDistrict(districtId: number): Promise<Upazila[]> {
    return this.upazilaModel
      .find({ district_id: districtId }, { createdAt: 0, updatedAt: 0, __v: 0 })
      .sort({ name: 1 });
  }

  async getFullTree(): Promise<any[]> {
    return this.divisionModel.aggregate([
      {
        $lookup: {
          from: 'districts',
          localField: '_id',
          foreignField: 'division_id',
          as: 'districts',
          pipeline: [
            {
              $lookup: {
                from: 'upazilas',
                localField: '_id',
                foreignField: 'district_id',
                as: 'upazilas',
                pipeline: [
                  { $project: { createdAt: 0, updatedAt: 0, __v: 0 } },
                  { $sort: { name: 1 } },
                ],
              },
            },
            { $project: { createdAt: 0, updatedAt: 0, __v: 0 } },
            { $sort: { name: 1 } },
          ],
        },
      },
      { $project: { createdAt: 0, updatedAt: 0, __v: 0 } },
      { $sort: { name: 1 } },
    ]);
  }
}
