import { HttpError } from './http';
import type { Env, RateLimitBinding } from './types';

const encoder = new TextEncoder();
const VISITOR_COOKIE = 'brick_visitor';
const COOKIE_AGE = 60 * 60 * 24 * 365;

function base64url(bytes: Uint8Array): string {
  let raw = '';
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signingKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function signVisitor(id: string, secret: string): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', await signingKey(secret), encoder.encode(id));
  return base64url(new Uint8Array(signature));
}

export function requireSessionSecret(env: Env): string {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    throw new HttpError(503, 'RANKED_UNAVAILABLE');
  }
  return env.SESSION_SECRET;
}

export async function readVisitor(request: Request, secret: string): Promise<string | null> {
  const cookies = request.headers.get('Cookie') || '';
  const value = cookies.split(';').map(part => part.trim()).find(part => part.startsWith(`${VISITOR_COOKIE}=`))?.slice(VISITOR_COOKIE.length + 1);
  if (!value) return null;
  const match = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/.exec(value);
  if (!match) return null;
  try {
    const signature = Uint8Array.from(atob(match[2].replace(/-/g, '+').replace(/_/g, '/') + '='), char => char.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', await signingKey(secret), signature, encoder.encode(match[1]));
    return valid ? match[1] : null;
  } catch {
    return null;
  }
}

export async function newVisitor(request: Request, secret: string): Promise<{ id: string; cookie: string }> {
  const id = crypto.randomUUID();
  const signature = await signVisitor(id, secret);
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return {
    id,
    cookie: `${VISITOR_COOKIE}=${id}.${signature}; Path=/; Max-Age=${COOKIE_AGE}; HttpOnly; SameSite=Lax${secure}`,
  };
}

export async function applyRateLimit(binding: RateLimitBinding, request: Request, visitorId: string | null): Promise<void> {
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const ipResult = await binding.limit({ key: `ip:${ip}` });
  if (!ipResult.success) throw new HttpError(429, 'RATE_LIMITED');
  if (visitorId) {
    const visitorResult = await binding.limit({ key: `visitor:${visitorId}` });
    if (!visitorResult.success) throw new HttpError(429, 'RATE_LIMITED');
  }
}

export function validateNickname(input: unknown): string {
  if (typeof input !== 'string') throw new HttpError(400, 'INVALID_NICKNAME');
  const name = input.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  const length = Array.from(name).length;
  if (length < 2 || length > 20 || !/^[\p{L}\p{N} _.-]+$/u.test(name) || /[\p{Cc}\p{Cf}]/u.test(name)) {
    throw new HttpError(400, 'INVALID_NICKNAME');
  }
  return name;
}

export async function verifyTurnstile(token: unknown, secret: string | undefined, hostname: string, ip: string): Promise<void> {
  if (!secret) return;
  if (typeof token !== 'string' || token.length < 1 || token.length > 2048) {
    throw new HttpError(403, 'TURNSTILE_REQUIRED');
  }
  let result: Response;
  try {
    result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token, remoteip: ip || undefined }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new HttpError(503, 'TURNSTILE_UNAVAILABLE');
  }
  if (!result.ok) throw new HttpError(503, 'TURNSTILE_UNAVAILABLE');
  const verified = await result.json() as { success?: boolean; hostname?: string };
  if (!verified.success || verified.hostname !== hostname) {
    throw new HttpError(403, 'TURNSTILE_FAILED');
  }
}
