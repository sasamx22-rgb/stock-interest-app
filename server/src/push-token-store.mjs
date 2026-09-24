import { atomicWriteFile as writeFile, serializeFileOperations } from './file-storage.mjs';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const MAX_TOKENS = 20;
const TOKEN_PATTERN = /^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9=_-]+\]$/;

export function isValidExpoPushToken(value) {
  return typeof value === 'string' && TOKEN_PATTERN.test(value.trim());
}

export class PushTokenStore {
  constructor({ filePath }) {
    this.filePath = filePath;
    serializeFileOperations(this, ['getAll', 'save', 'register', 'remove']);
  }

  async getAll() {
    try {
      const payload = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (!Array.isArray(payload)) throw new Error('Push token file must contain an array');

      const seen = new Set();
      return payload.flatMap((item) => {
        if (!item || !isValidExpoPushToken(item.token)) return [];
        const token = item.token.trim();
        if (seen.has(token)) return [];
        seen.add(token);
        return [{
          token,
          platform: item.platform === 'ios' ? 'ios' : 'android',
          updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date(0).toISOString(),
        }];
      }).slice(0, MAX_TOKENS);
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
  }

  async save(items) {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(items, null, 2)}\n`, 'utf8');
    return items;
  }

  async register({ token, platform }) {
    if (!isValidExpoPushToken(token)) {
      const error = new Error('Invalid Expo push token');
      error.statusCode = 400;
      throw error;
    }

    const normalized = token.trim();
    const items = await this.getAll();
    const now = new Date().toISOString();
    const existing = items.find((item) => item.token === normalized);

    if (existing) {
      const next = items.map((item) => item.token === normalized
        ? { ...item, platform: platform === 'ios' ? 'ios' : 'android', updatedAt: now }
        : item);
      return this.save(next);
    }

    if (items.length >= MAX_TOKENS) {
      const error = new Error(`Push token store supports up to ${MAX_TOKENS} devices`);
      error.statusCode = 409;
      throw error;
    }

    return this.save([
      ...items,
      {
        token: normalized,
        platform: platform === 'ios' ? 'ios' : 'android',
        updatedAt: now,
      },
    ]);
  }

  async remove(token) {
    if (!isValidExpoPushToken(token)) return this.getAll();
    const normalized = token.trim();
    const items = await this.getAll();
    return this.save(items.filter((item) => item.token !== normalized));
  }
}
