import { atomicWriteFile as writeFile, serializeFileOperations } from './file-storage.mjs';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const MAX_VIEWS = 1200;

function normalizeState(value) {
  const readReports = value?.readReports && typeof value.readReports === 'object'
    ? Object.fromEntries(Object.entries(value.readReports).flatMap(([id, readAt]) => (
      typeof id === 'string' && typeof readAt === 'string' && Number.isFinite(Date.parse(readAt))
        ? [[id, readAt]]
        : []
    )))
    : {};

  const stockViews = Array.isArray(value?.stockViews)
    ? value.stockViews.flatMap((item) => {
      if (!item || !['KR', 'US'].includes(item.market)) return [];
      const code = String(item.code ?? '').trim();
      const name = String(item.name ?? code).trim();
      const viewedAt = String(item.viewedAt ?? '');
      if (!code || !name || !Number.isFinite(Date.parse(viewedAt))) return [];
      return [{ market: item.market, code, name, viewedAt }];
    }).slice(-MAX_VIEWS)
    : [];

  return { readReports, stockViews };
}

export class EngagementStore {
  constructor({ filePath }) {
    this.filePath = filePath;
    serializeFileOperations(this, ['get', 'save', 'markReportRead', 'logStockView']);
  }

  async get() {
    try {
      return normalizeState(JSON.parse(await readFile(this.filePath, 'utf8')));
    } catch (error) {
      if (error?.code === 'ENOENT') return { readReports: {}, stockViews: [] };
      throw error;
    }
  }

  async save(value) {
    const normalized = normalizeState(value);
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    return normalized;
  }

  async markReportRead(id, readAt = new Date()) {
    const clean = String(id ?? '').trim();
    if (!clean) {
      const error = new Error('Invalid report id');
      error.statusCode = 400;
      throw error;
    }

    const state = await this.get();
    if (!state.readReports[clean]) {
      state.readReports[clean] = readAt.toISOString();
    }
    return this.save(state);
  }

  async logStockView({ market, code, name }, viewedAt = new Date()) {
    if (!['KR', 'US'].includes(market) || !code) {
      const error = new Error('Invalid stock view');
      error.statusCode = 400;
      throw error;
    }

    const state = await this.get();
    state.stockViews.push({
      market,
      code: String(code).trim(),
      name: String(name ?? code).trim(),
      viewedAt: viewedAt.toISOString(),
    });
    state.stockViews = state.stockViews.slice(-MAX_VIEWS);
    return this.save(state);
  }
}
