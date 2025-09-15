import { Injectable } from '@nestjs/common';
import { ShareClass, Prisma } from '@prisma/client';
import { DatabaseService } from '../database.service';
import { ShareClassRepository } from '../interfaces';

@Injectable()
export class ShareClassRepositoryImpl implements ShareClassRepository {
  constructor(private readonly prisma: DatabaseService) {}

  async create(data: Prisma.ShareClassCreateInput): Promise<ShareClass> {
    return this.prisma.shareClass.create({ data });
  }

  async findById(id: number): Promise<ShareClass | null> {
    return this.prisma.shareClass.findUnique({ where: { id } });
  }

  async findMany(where?: Prisma.ShareClassWhereInput, skip?: number, take?: number): Promise<ShareClass[]> {
    return this.prisma.shareClass.findMany({ where, skip, take });
  }

  async update(id: number, data: Prisma.ShareClassUpdateInput): Promise<ShareClass> {
    return this.prisma.shareClass.update({ where: { id }, data });
  }

  async delete(id: number): Promise<ShareClass> {
    return this.prisma.shareClass.delete({ where: { id } });
  }

  async count(where?: Prisma.ShareClassWhereInput): Promise<number> {
    return this.prisma.shareClass.count({ where });
  }

  async findByName(name: string): Promise<ShareClass | null> {
    return this.prisma.shareClass.findUnique({
      where: { name }
    });
  }

  async findByDepartmentId(departmentId: number): Promise<ShareClass[]> {
    return this.prisma.shareClass.findMany({
      where: { departmentId }
    });
  }

  async findWithPortfolios(shareClassId: number): Promise<ShareClass | null> {
    return this.prisma.shareClass.findUnique({
      where: { id: shareClassId },
      include: {
        portfolios: true
      }
    });
  }

  async findWithFeeLedgers(shareClassId: number): Promise<ShareClass | null> {
    return this.prisma.shareClass.findUnique({
      where: { id: shareClassId },
      include: {
        feeLedgers: {
          orderBy: { incurredAt: 'desc' }
        }
      }
    });
  }
}