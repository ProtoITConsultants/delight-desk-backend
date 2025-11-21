export interface OAuthAccount {
  id: string;
  provider: string;
  email: string;
  status: string;
  providerUserId: string;
  createdAt: string;
}

export interface StoreConnection {
  id: string;
  platform: string;
  storeName: string;
  storeUrl: string;
  isActive: boolean;
  createdAt: string;
}

export interface UserDetail {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  lastLoginAt: string | null;
  oauthAccount: OAuthAccount | null;
  storeConnection: StoreConnection | null;
}

export interface GetUsersResponse {
  total: number;
  page: number;
  limit: number;
  items: UserDetail[];
}

export interface VerifyAdminResponse {
  isAdmin: boolean;
}

export interface DeleteUserResponse {
  deleted: boolean;
}

export interface MeResponse {
  id: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}
