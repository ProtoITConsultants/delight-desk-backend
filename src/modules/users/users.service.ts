import { sql } from 'drizzle-orm';
import { CreateUserDto } from './dto/index.dto';
import { UserRepository } from './users.repository';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { GoogleOauthRepository } from '../google-oauth/google-oauth.repository';
import { MicrosoftOauthRepository } from '../microsoft-oauth/microsoft-oauth.repository';
import { UserStoreConnectionsRepository } from '../woocommerce-oauth/user-store-connections.repository';
import type {
  GetUsersResponse,
  UserDetail,
  VerifyAdminResponse,
  DeleteUserResponse,
  MeResponse,
} from './dto/response.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly msOauthRepo: MicrosoftOauthRepository,
    private readonly googleOauthRepo: GoogleOauthRepository,
    private readonly storeRepo: UserStoreConnectionsRepository,
  ) {}

  create(createUserDto: CreateUserDto) {
    return this.userRepo.create(createUserDto);
  }

  findOne(id: string) {
    return this.userRepo.findById(id);
  }

  findByEmail(email: string) {
    return this.userRepo.findByEmail(email);
  }

  update(id: string, fields: object) {
    return this.userRepo.update(id, fields);
  }

  remove(id: string) {
    return this.userRepo.delete(id);
  }

  setResetToken(userId: string, token: string, expiry: Date) {
    return this.userRepo.update(userId, {
      passwordResetToken: token,
      passwordResetExpiresAt: expiry,
    });
  }

  findByResetToken(token: string) {
    return this.userRepo.findByResetToken(token);
  }

  updatePassword(userId: string, hashedPassword: string) {
    return this.userRepo.update(userId, {
      password: hashedPassword,
      passwordResetToken: null,
      passwordResetExpiresAt: null,
    });
  }

  async verifyAdmin(userId: string): Promise<VerifyAdminResponse> {
    const isAdmin = await this.userRepo.isAdmin(userId);
    return { isAdmin };
  }

  async me(userId: string): Promise<MeResponse> {
    const row: any = await this.userRepo.findByIdBasic(userId);
    return row[0];
  }

  async deleteUserById(sessionUserId: string, targetId: string): Promise<DeleteUserResponse> {
    const isAdmin = await this.userRepo.isAdmin(sessionUserId);
    if (!isAdmin) throw new ForbiddenException();

    await this.userRepo.deleteSessionsByUserId(targetId);
    await this.userRepo.deleteById(targetId);
    return { deleted: true };
  }

  async getUsersForAdminPanel(q?: string, page = 1, limit = 20): Promise<GetUsersResponse> {
    const offset = (page - 1) * limit;

    let whereSql = sql`WHERE TRUE`;

    if (q && q.trim()) {
      const like = `%${q.trim().toLowerCase()}%`;

      whereSql = sql`
      ${whereSql}
      AND (
        LOWER(u.email) LIKE ${like}
        OR LOWER(u.first_name) LIKE ${like}
        OR LOWER(u.last_name) LIKE ${like}
        OR LOWER(u.phone) LIKE ${like}
      )
    `;
    }

    const total = await this.userRepo.countUsers(whereSql);
    const rows: any = await this.userRepo.getUsers(whereSql, limit, offset);

    const items: UserDetail[] = rows.map((r) => ({
      id: r.id,
      email: r.email,
      firstName: r.firstName,
      lastName: r.lastName,
      phone: r.phone,
      lastLoginAt: r.lastLoginAt,
      oauthAccount: r.oauthAccount ?? null,
      storeConnection: r.storeConnection ?? null,
      subscriptionPlanName: r.subscriptionPlanName ?? null,
    }));

    return {
      total,
      page,
      limit,
      items,
    };
  }

  async getConnectionsDetail(userId: string) {
    const gmailConnectionDetail = await this.googleOauthRepo.getGoogleAccount(userId);
    const outlookConnectionDetail = await this.msOauthRepo.getMicrosoftAccount(userId);
    const wooConnection = await this.storeRepo.findByPlatform(userId, 'woocommerce');

    const connectionsDetailTemplate = {
      wooCommerce: wooConnection
        ? {
            status: wooConnection.isActive ? 'connected' : 'disconnected',
            storeUrl: wooConnection.storeUrl,
          }
        : null,
      gmail: gmailConnectionDetail
        ? { status: gmailConnectionDetail.status, email: gmailConnectionDetail.email }
        : null,
      outlook: outlookConnectionDetail
        ? { status: outlookConnectionDetail.status, email: outlookConnectionDetail.email }
        : null,
      shipbob: null,
      shipstation: null,
    };

    return connectionsDetailTemplate;
  }
}
