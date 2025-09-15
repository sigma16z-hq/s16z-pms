import { FeeLedger, Prisma } from '@prisma/client';
import { BaseRepository } from './base-repository.interface';

export interface FeeLedgerRepository extends BaseRepository<
  FeeLedger,
  Prisma.FeeLedgerCreateInput,
  Prisma.FeeLedgerUpdateInput,
  Prisma.FeeLedgerWhereInput
> {
  findByShareClassId(shareClassId: number): Promise<FeeLedger[]>;
  findByFeeType(shareClassId: number, feeType: string): Promise<FeeLedger[]>;
  findByDateRange(shareClassId: number, fromDate: Date, toDate: Date): Promise<FeeLedger[]>;
  findByExternalId(externalId: string): Promise<FeeLedger | null>;
}