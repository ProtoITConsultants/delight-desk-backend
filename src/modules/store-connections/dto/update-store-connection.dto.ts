import { PartialType } from '@nestjs/mapped-types';
import { CreateStoreConnectionDto } from './create-store-connection.dto';

export class UpdateStoreConnectionDto extends PartialType(CreateStoreConnectionDto) {}
