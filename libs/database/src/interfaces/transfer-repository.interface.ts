import { Transfer, Prisma, AccountType } from '@prisma/client';
import { BaseRepository } from './base-repository.interface';

export interface TransferRepository extends BaseRepository<
  Transfer,
  Prisma.TransferCreateInput,
  Prisma.TransferUpdateInput,
  Prisma.TransferWhereInput
> {
  findByAccount(accountType: AccountType, accountId: bigint): Promise<Transfer[]>;
  findByDateRange(fromDate: Date, toDate: Date): Promise<Transfer[]>;
  findNetInflowForAccount(accountType: AccountType, accountId: bigint, upToDate: Date): Promise<number>;
}