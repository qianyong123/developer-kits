import { callCloudFunction } from '@/shared/lib/cloudbase';
import type { AuthUser } from '@/features/auth/types';

export interface AuthSession {
  token: string;
  user: AuthUser;
}

export async function register(username: string, password: string): Promise<AuthSession> {
  return callCloudFunction<AuthSession>('auth', { action: 'register', username, password });
}

export async function login(username: string, password: string): Promise<AuthSession> {
  return callCloudFunction<AuthSession>('auth', { action: 'login', username, password });
}

export async function fetchCurrentUser(token: string): Promise<AuthUser> {
  const data = await callCloudFunction<{ user: AuthUser }>('auth', { action: 'me', token });
  return data.user;
}
