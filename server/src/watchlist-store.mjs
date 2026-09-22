import { atomicWriteFile as writeFile, serializeFileOperations } from './file-storage.mjs';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const MAX_ITEMS = 80;
const VALID_CODE = /^[A-Za-z0-9._-]{1,40}$/;

function normalizeItem(item) {
  if (!item || typeof item !== 'object') return null;

  const market = String(item.market ?? '').toUpperCase();
  const code = String(item.code ?? item.naverCode ?? '').trim();
  const name = String(item.name ?? code).trim();

  if (!['KR', 'US'].includes(market)) return null;
  if (!VALID_CODE.test(code)) return null;
  if (market === 'KR' && !/^\d{6}$/.test(code)) return null;
  if (!name || name.length > 100) return null;

  return { market, code, name };
}

function dedupe(items) {
  const seen = new Set();
  return items.flatMap((item) => {
    const normalized = normalizeItem(item);
    if (!normalized) return [];

    const key = `${normalized.market}:${normalized.code.toUpperCase()}`;
    if (seen.has(key)) return [];

    seen.add(key);
    return [normalized];
  }).slice(0, MAX_ITEMS);
}

export class WatchlistStore {
  constructor({ filePath, defaults = [] }) {
    this.filePath = filePath;
    serializeFileOperations(this, ['getAll', 'save', 'add', 'remove']);
    this.defaults = dedupe(defaults);
  }

  async getAll() {
    try {
      const payload = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (!Array.isArray(payload)) throw new Error('Watchlist file must contain an array');
      return dedupe(payload);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      await this.save(this.defaults);
      return [...this.defaults];
    }
  }

  async save(items) {
    const normalized = dedupe(items);
    await mkdir(dirname(this.filePath), { recursive: true });

    await writeFile(this.filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    return normalized;
  }

  async add(item) {
    const normalized = normalizeItem(item);
    if (!normalized) {
      const error = new Error('Invalid watchlist item');
      error.statusCode = 400;
      throw error;
    }

    const items = await this.getAll();
    const key = `${normalized.market}:${normalized.code.toUpperCase()}`;
    const exists = items.some(
      (candidate) => `${candidate.market}:${candidate.code.toUpperCase()}` === key,
    );

    if (exists) return items;
    if (items.length >= MAX_ITEMS) {
      const error = new Error(`Watchlist supports up to ${MAX_ITEMS} items`);
      error.statusCode = 409;
      throw error;
    }

    return this.save([...items, normalized]);
  }

  async remove(market, code) {
    const targetMarket = String(market ?? '').toUpperCase();
    const targetCode = String(code ?? '').trim().toUpperCase();

    if (!['KR', 'US'].includes(targetMarket) || !VALID_CODE.test(targetCode)) {
      const error = new Error('Invalid watchlist item');
      error.statusCode = 400;
      throw error;
    }

    const items = await this.getAll();
    return this.save(items.filter(
      (item) => !(item.market === targetMarket && item.code.toUpperCase() === targetCode),
    ));
  }
}

export { normalizeItem };
