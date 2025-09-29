export interface GoogleAccount {
  provider: 'google';
  providerUserId: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
  accessToken: string;
  refreshToken: string;
  scopes?: string[];
  expiresAt?: Date;
}
