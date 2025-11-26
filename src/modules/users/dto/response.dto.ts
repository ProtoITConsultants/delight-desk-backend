export interface BillingPlan {
  id: string;
  name: string;
  displayName: string;
  price: string;
  resolutions: number;
  costPerResolution: string;
  emailLimit: number | null;
  features: string[];
}

export interface Subscription {
  subscriptionId: string;
  status: string;
  stripeSubscriptionId: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: number | null;
  resolutionsRemaining: number;
  plan: BillingPlan;
}

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
  subscription: Subscription | null;
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
