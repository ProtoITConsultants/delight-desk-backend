export interface GoogleAccount {
  provider: 'google';
  email: string;
  providerUserId: string;
  displayName?: string;
  avatarUrl?: string;
  accessToken: string;
  refreshToken: string;
  scopes?: string[];
  expiresAt: Date;
}
