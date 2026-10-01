import { Buffer } from 'node:buffer';

import { normalizeReport } from './report-store.mjs';

const MAX_REPORTS = 120;
const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_BASE64_CHARS = Math.ceil(MAX_PDF_BYTES / 3) * 4 + 16_384;

function encodePath(value) {
  return String(value)
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function normalizePdfPartPath(value) {
  if (typeof value !== 'string') return '';
  const clean = value.trim();
  if (
    !clean
    || clean.length > 240
    || !clean.startsWith('auto-reports/pdfs/')
    || !clean.endsWith('.b64')
    || clean.includes('..')
    || clean.includes('\\')
  ) {
    return '';
  }
  return clean;
}

function normalizePdfParts(value) {
  const source = typeof value === 'string' ? [value] : value;
  if (!Array.isArray(source) || source.length === 0 || source.length > 100) return [];

  const parts = source.map(normalizePdfPartPath);
  if (parts.some((item) => !item)) return [];
  return [...new Set(parts)];
}

export class GitHubReportSync {
  constructor({
    reportStore,
    reportPdfStore,
    repository,
    ref,
    filePath,
    enabled = false,
    intervalMs = 120_000,
    fetchImpl = fetch,
    logger = console,
  }) {
    this.reportStore = reportStore;
    this.reportPdfStore = reportPdfStore;
    this.repository = repository;
    this.ref = ref;
    this.filePath = filePath;
    this.enabled = Boolean(enabled && repository && ref && filePath);
    this.intervalMs = Math.max(60_000, Number(intervalMs) || 120_000);
    this.fetchImpl = fetchImpl;
    this.logger = logger;
    this.lastAttemptAt = 0;
    this.inFlight = null;
  }

  async syncIfDue({ force = false } = {}) {
    if (!this.enabled) return { status: 'disabled', imported: 0, pdfImported: 0 };
    if (this.inFlight) return this.inFlight;

    const now = Date.now();
    if (!force && now - this.lastAttemptAt < this.intervalMs) {
      return { status: 'fresh', imported: 0, pdfImported: 0 };
    }

    this.lastAttemptAt = now;
    this.inFlight = this.#sync().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  #repositoryParts() {
    const [owner, name, ...extra] = String(this.repository).split('/');
    if (!owner || !name || extra.length > 0) {
      throw new Error('REPORT_GITHUB_REPOSITORY must be owner/repo');
    }
    return { owner, name };
  }

  #contentsUrl(path) {
    const { owner, name } = this.#repositoryParts();
    const url = new URL(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents/${encodePath(path)}`,
    );
    url.searchParams.set('ref', this.ref);
    return url;
  }

  #headers(accept) {
    return {
      Accept: accept,
      'User-Agent': 'market-pulse-report-sync',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  async #fetchManifest() {
    const response = await this.fetchImpl(this.#contentsUrl(this.filePath), {
      headers: this.#headers('application/vnd.github+json'),
    });

    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`GitHub report sync failed: ${response.status}`);
    }

    const payload = await response.json();
    if (payload?.type !== 'file' || payload?.encoding !== 'base64' || typeof payload?.content !== 'string') {
      throw new Error('GitHub report manifest is not a base64 file response');
    }

    return Buffer.from(payload.content.replace(/\s+/g, ''), 'base64').toString('utf8');
  }

  async #fetchPdfBase64Part(path) {
    const response = await this.fetchImpl(this.#contentsUrl(path), {
      headers: this.#headers('application/vnd.github.raw+json'),
    });
    if (!response.ok) {
      throw new Error(`GitHub report PDF part failed (${response.status}): ${path}`);
    }

    const text = (await response.text()).replace(/\s+/g, '');
    if (!text || text.length > MAX_BASE64_CHARS || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) {
      throw new Error(`Invalid report PDF base64 part: ${path}`);
    }
    return text;
  }

  async #downloadPdf(parts) {
    const encodedParts = [];
    let totalChars = 0;

    for (const path of parts) {
      const text = await this.#fetchPdfBase64Part(path);
      totalChars += text.length;
      if (totalChars > MAX_BASE64_CHARS) {
        throw new Error('Auto-published report PDF exceeds 25MB limit');
      }
      encodedParts.push(text);
    }

    const bytes = Buffer.from(encodedParts.join(''), 'base64');
    if (bytes.length > MAX_PDF_BYTES) {
      throw new Error('Auto-published report PDF exceeds 25MB limit');
    }
    return bytes;
  }

  async #sync() {
    const manifestText = await this.#fetchManifest();
    if (manifestText === null) {
      return { status: 'missing', imported: 0, pdfImported: 0 };
    }

    const parsed = JSON.parse(manifestText);
    const reports = Array.isArray(parsed) ? parsed : parsed?.reports;
    if (!Array.isArray(reports)) {
      throw new Error('GitHub report manifest must contain an array');
    }

    let imported = 0;
    let unchanged = 0;
    let invalid = 0;
    let pdfImported = 0;
    let pdfErrors = 0;

    for (const candidate of reports.slice(0, MAX_REPORTS)) {
      const normalized = normalizeReport(candidate);
      if (!normalized) {
        invalid += 1;
        continue;
      }

      const existing = await this.reportStore.getById(normalized.id);
      const pdfParts = normalizePdfParts(candidate.pdfBase64Parts ?? candidate.pdfBase64Path);
      const retentionMs = this.reportPdfStore?.retentionMs ?? 30 * 24 * 60 * 60 * 1000;
      const reportAge = Date.now() - Date.parse(normalized.publishedAt);
      const withinPdfRetention = reportAge <= retentionMs;
      const needsPdf = Boolean(
        this.reportPdfStore
        && pdfParts.length > 0
        && withinPdfRetention
        && (
          !existing?.pdfUrl
          || (
            normalized.pdfSourceVersion
            && normalized.pdfSourceVersion !== existing.pdfSourceVersion
          )
        )
      );

      let nextReport = normalized;

      if (needsPdf) {
        try {
          const bytes = await this.#downloadPdf(pdfParts);
          await this.reportPdfStore.save(normalized.id, bytes);
          nextReport = {
            ...normalized,
            pdfUrl: `/api/reports/${encodeURIComponent(normalized.id)}/pdf`,
          };
          pdfImported += 1;
        } catch (error) {
          pdfErrors += 1;
          this.logger.warn?.(`Automatic PDF sync failed for ${normalized.id}`, error);
          if (existing?.pdfUrl) {
            nextReport = {
              ...normalized,
              pdfUrl: existing.pdfUrl,
              ...(existing.pdfSourceVersion
                ? { pdfSourceVersion: existing.pdfSourceVersion }
                : {}),
            };
          }
        }
      } else if (existing?.pdfUrl) {
        nextReport = {
          ...normalized,
          pdfUrl: existing.pdfUrl,
          ...(!normalized.pdfSourceVersion && existing.pdfSourceVersion
            ? { pdfSourceVersion: existing.pdfSourceVersion }
            : {}),
        };
      }

      if (existing && JSON.stringify(existing) === JSON.stringify(nextReport)) {
        unchanged += 1;
        continue;
      }

      await this.reportStore.upsert(nextReport);
      imported += 1;
    }

    if (invalid > 0) {
      this.logger.warn?.(`Ignored ${invalid} invalid auto-published report(s)`);
    }

    return {
      status: 'synced',
      imported,
      unchanged,
      invalid,
      pdfImported,
      pdfErrors,
    };
  }
}
