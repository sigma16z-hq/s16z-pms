export interface BaseRepository<T, CreateDto, UpdateDto, WhereDto = any> {
  create(data: CreateDto): Promise<T>;
  findById(id: string | number | bigint): Promise<T | null>;
  findMany(where?: WhereDto, skip?: number, take?: number): Promise<T[]>;
  update(id: string | number | bigint, data: UpdateDto): Promise<T>;
  delete(id: string | number | bigint): Promise<T>;
  count(where?: WhereDto): Promise<number>;
}