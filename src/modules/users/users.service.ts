import { sql } from 'drizzle-orm';
import { CreateUserDto } from './dto/index.dto';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { UserRepository } from '../../database/repos/users.repository';
import { GoogleOauthRepository } from '../../database/repos/google-oauth.repository';
import { MicrosoftOauthRepository } from '../../database/repos/microsoft-oauth.repository';
import { UserStoreConnectionsRepository } from '../../database/repos/user-store-connections.repository';
import type {
  DeleteUserResponse,
  GetUsersResponse,
  MeResponse,
  VerifyAdminResponse,
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

  async deleteUserById(adminUserId: string, userId: string): Promise<DeleteUserResponse> {
    const isAdmin = await this.userRepo.isAdmin(adminUserId);
    if (!isAdmin) throw new ForbiddenException();

    const isSelfDelete = adminUserId === userId;
    if (isSelfDelete) throw new ForbiddenException('Self delete is not allowed.');

    await Promise.all([
      this.userRepo.deleteSessionsByUserId(userId),
      this.userRepo.deleteById(userId),
    ]);

    return { deleted: true };
  }

  async getUsersForAdminPanel(
    userId: string,
    q?: string,
    page = 1,
    limit = 20,
  ): Promise<GetUsersResponse> {
    const offset = (page - 1) * limit;

    let conditions = sql`TRUE`;

    if (q && q.trim()) {
      const like = `%${q.trim().toLowerCase()}%`;

      conditions = sql`
      ${conditions}
      AND (
        LOWER(u.email) LIKE ${like}
        OR LOWER(u.first_name) LIKE ${like}
        OR LOWER(u.last_name) LIKE ${like}
      )
    `;
    }

    const total = await this.userRepo.countUsers(conditions, userId);
    const rows = await this.userRepo.getUsers(conditions, limit, offset, userId);

    const items: any = rows.map((r) => ({
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

    return { total, page, limit, items };
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

  async initializeUser(userId: string): Promise<boolean> {
    return await this.userRepo.initializeUser(userId);
  }
}
