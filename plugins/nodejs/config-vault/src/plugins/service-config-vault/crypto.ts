import { createCipheriv, createDecipheriv, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual, createHmac } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);

export interface EncryptedPayload {
  encryptedPayload: string;
  iv: string;
  authTag: string;
  keyVersion: string;
}

export function newId(): string {
  return randomUUID();
}

export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function loadMasterKey(raw: string): Buffer {
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('CONFIG_VAULT_MASTER_KEY must be a base64 encoded 32-byte key');
  }
  return key;
}

export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(secret, salt, 64) as Buffer;
  return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function verifySecret(secret: string, hash: string): Promise<boolean> {
  const parts = hash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'base64url');
  const expected = Buffer.from(parts[2], 'base64url');
  const actual = await scrypt(secret, salt, expected.length) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function encryptJson(value: unknown, key: Buffer, keyVersion = 'v1'): EncryptedPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  return {
    encryptedPayload: encrypted.toString('base64url'),
    iv: iv.toString('base64url'),
    authTag: cipher.getAuthTag().toString('base64url'),
    keyVersion,
  };
}

export function decryptJson<T>(payload: EncryptedPayload, key: Buffer): T {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.encryptedPayload, 'base64url')),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString('utf8')) as T;
}

export function createTotpSecret(): string {
  return toBase32(randomBytes(20));
}

export function verifyTotp(secret: string, code: string, now = Date.now()): boolean {
  const cleaned = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleaned)) return false;
  const step = Math.floor(now / 30000);
  return [-1, 0, 1].some((offset) => generateTotp(secret, step + offset) === cleaned);
}

export function generateTotp(secret: string, step = Math.floor(Date.now() / 30000)): string {
  const key = decodeTotpSecret(secret);
  const counter = Buffer.alloc(8);
  counter.writeBigInt64BE(BigInt(step));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const value = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);
  return String(value % 1_000_000).padStart(6, '0');
}

export function createTotpUri(secret: string, account: string, issuer = 'BSB Vault'): string {
  const label = `${issuer}:${account}`;
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

function decodeTotpSecret(secret: string): Buffer {
  const cleaned = secret.replace(/\s+/g, '').replace(/=+$/g, '').toUpperCase();
  if (/^[A-Z2-7]+$/.test(cleaned)) return fromBase32(cleaned);
  return Buffer.from(secret, 'base64url');
}

function toBase32(buffer: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function fromBase32(secret: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of secret) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error('Invalid TOTP secret');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
