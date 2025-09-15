import { ShareClass, Prisma } from '@prisma/client';
import { BaseRepository } from './base-repository.interface';

export interface ShareClassRepository extends BaseRepository<
  ShareClass,
  Prisma.ShareClassCreateInput,
  Prisma.ShareClassUpdateInput,
  Prisma.ShareClassWhereInput
> {
  findByName(name: string): Promise<ShareClass | null>;
  findByDepartmentId(departmentId: number): Promise<ShareClass[]>;
  findWithPortfolios(shareClassId: number): Promise<ShareClass | null>;
  findWithFeeLedgers(shareClassId: number): Promise<ShareClass | null>;
}