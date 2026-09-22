import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const MAX_REPORTS = 400;
const ID_PATTERN = /^[A-Za-z0-9._-]{1,80}$/;

function cleanString(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function normalizeStringArray(value, maxItems = 20, maxLength = 120) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.flatMap((item) => {
    const clean = cleanString(item, maxLength);
    if (!clean || seen.has(clean)) return [];
    seen.add(clean);
    return [clean];
  }).slice(0, maxItems);
}

function normalizeUrl(value) {
  const clean = cleanString(value, 1000);
  if (!clean) return undefined;

  try {
    const url = new URL(clean);
    if (!['http:', 'https:'].includes(url.protocol)) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export function normalizeReport(value) {
  if (!value || typeof value !== 'object') return null;

  const id = cleanString(value.id, 80);
  const title = cleanString(value.title, 180);
  const summary = cleanString(value.summary, 4000);
  const marketSummary = cleanString(value.marketSummary, 6000);
  const type = value.type === 'premarket' ? 'premarket' : value.type === 'morning' ? 'morning' : null;
  const publishedAt = cleanString(value.publishedAt, 80);
  const publishedTime = Date.parse(publishedAt);

  if (!ID_PATTERN.test(id) || !title || !summary || !type || !Number.isFinite(publishedTime)) {
    return null;
  }

  return {
    id,
    title,
    publishedAt: new Date(publishedTime).toISOString(),
    type,
    summary,
    tickers: normalizeStringArray(value.tickers, 30, 40),
    highlights: normalizeStringArray(value.highlights, 12, 300),
    ...(marketSummary ? { marketSummary } : {}),
    ...(normalizeUrl(value.pdfUrl) ? { pdfUrl: normalizeUrl(value.pdfUrl) } : {}),
  };
}

function sortReports(items) {
  return [...items].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

export class ReportStore {
  constructor({ filePath, defaults = [] }) {
    this.filePath = filePath;
    this.defaults = defaults.flatMap((item) => {
      const report = normalizeReport(item);
      return report ? [report] : [];
    });
  }

  async getAll() {
    try {
      const payload = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (!Array.isArray(payload)) throw new Error('Report file must contain an array');

      const seen = new Set();
      const normalized = payload.flatMap((item) => {
        const report = normalizeReport(item);
        if (!report || seen.has(report.id)) return [];
        seen.add(report.id);
        return [report];
      });

      return sortReports(normalized).slice(0, MAX_REPORTS);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      await this.save(this.defaults);
      return sortReports(this.defaults);
    }
  }

  async save(items) {
    const normalized = sortReports(items).slice(0, MAX_REPORTS);
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    return normalized;
  }

  async getById(id) {
    return (await this.getAll()).find((item) => item.id === id) ?? null;
  }

  async upsert(value) {
    const report = normalizeReport(value);
    if (!report) {
      const error = new Error('Invalid report payload');
      error.statusCode = 400;
      throw error;
    }

    const items = await this.getAll();
    const next = [report, ...items.filter((item) => item.id !== report.id)];
    await this.save(next);
    return report;
  }

  async remove(id) {
    const clean = cleanString(id, 80);
    if (!ID_PATTERN.test(clean)) {
      const error = new Error('Invalid report id');
      error.statusCode = 400;
      throw error;
    }

    const items = await this.getAll();
    return this.save(items.filter((item) => item.id !== clean));
  }
}
