import { Injectable } from '@nestjs/common';
import { StoreConnectionsRepository } from './store-connections.repository';
import { CreateStoreConnectionDto } from './dto/create-store-connection.dto';
import { UpdateStoreConnectionDto } from './dto/update-store-connection.dto';

@Injectable()
export class StoreConnectionsService {
  constructor(private readonly repo: StoreConnectionsRepository) {}

  create(data: CreateStoreConnectionDto) {
    return this.repo.create(data);
  }

  findAll(userId: string) {
    return this.repo.findAllByUser(userId);
  }

  findOne(id: string, userId: string) {
    return this.repo.findById(id, userId);
  }

  update(id: string, userId: string, data: UpdateStoreConnectionDto) {
    return this.repo.update(id, userId, data);
  }

  remove(id: string, userId: string) {
    return this.repo.delete(id, userId);
  }
}
