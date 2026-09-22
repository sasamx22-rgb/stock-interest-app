import { atomicWriteFile as writeFile, serializeFileOperations } from './file-storage.mjs';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const MAX_RECEIPTS = 1000;

export class PushReceiptStore {
  constructor({ filePath }) {
    this.filePath = filePath;
    serializeFileOperations(this, ['getAll', 'save', 'add', 'remove']);
  }

  async getAll() {
    try {
      const payload = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (!Array.isArray(payload)) return [];
      return payload.flatMap((item) => {
        if (!item || typeof item.id !== 'string' || typeof item.token !== 'string') return [];
        return [{
          id: item.id.slice(0, 200),
          token: item.token.slice(0, 300),
          createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date(0).toISOString(),
          attempts: Math.max(0, Number(item.attempts) || 0),
        }];
      }).slice(-MAX_RECEIPTS);
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
  }

  async save(items) {
    await mkdir(dirname(this.filePath), { recursive: true });
    const next = items.slice(-MAX_RECEIPTS);
    await writeFile(this.filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    return next;
  }

  async add(items) {
    if (!Array.isArray(items) || items.length === 0) return this.getAll();
    const existing = await this.getAll();
    const byId = new Map(existing.map((item) => [item.id, item]));
    const now = new Date().toISOString();
    for (const item of items) {
      if (!item?.id || !item?.token) continue;
      byId.set(String(item.id), {
        id: String(item.id),
        token: String(item.token),
        createdAt: now,
        attempts: 0,
      });
    }
    return this.save([...byId.values()]);
  }

  async remove(ids) {
    const targets = new Set(ids ?? []);
    const items = await this.getAll();
    return this.save(items.filter((item) => !targets.has(item.id)));
  }
}
