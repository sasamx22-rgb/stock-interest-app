import { Buffer } from 'node:buffer';

import { normalizeReport } from './report-store.mjs';

function encodePath(value) {
  return String(value)
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');
}

export class GitHubReportSync {
  constructor({
    reportStore,
    repository,
    ref,
    filePath,
    enabled = false,
    intervalMs = 120_000,
    fetchImpl = fetch,
    logger = console,
  }) {
    this.reportStore = reportStore;
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
    if (!this.enabled) return { status: 'disabled', imported: 0 };
    if (this.inFlight) return this.inFlight;

    const now = Date.now();
    if (!force && now - this.lastAttemptAt < this.intervalMs) {
      return { status: 'fresh', imported: 0 };
    }

    this.lastAttemptAt = now;
    this.inFlight = this.#sync().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  async #sync() {
    const [owner, name, ...extra] = String(this.repository).split('/');
    if (!owner || !name || extra.length > 0) {
      throw new Error('REPORT_GITHUB_REPOSITORY must be owner/repo');
    }

    const url = new URL(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents/${encodePath(this.filePath)}`,
    );
    url.searchParams.set('ref', this.ref);

    const response = await this.fetchImpl(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'market-pulse-report-sync',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (response.status === 404) {
      return { status: 'missing', imported: 0 };
    }
    if (!response.ok) {
      throw new Error(`GitHub report sync failed: ${response.status}`);
    }

    const payload = await response.json();
    if (payload?.type !== 'file' || payload?.encoding !== 'base64' || typeof payload?.content !== 'string') {
      throw new Error('GitHub report manifest is not a base64 file response');
    }

    const text = Buffer.from(payload.content.replace(/\s+/g, ''), 'base64').toString('utf8');
    const parsed = JSON.parse(text);
    const reports = Array.isArray(parsed) ? parsed : parsed?.reports;
    if (!Array.isArray(reports)) {
      throw new Error('GitHub report manifest must contain an array');
    }

    let imported = 0;
    let unchanged = 0;
    let invalid = 0;

    for (const candidate of reports.slice(0, 120)) {
      const normalized = normalizeReport(candidate);
      if (!normalized) {
        invalid += 1;
        continue;
      }

      const existing = await this.reportStore.getById(normalized.id);
      const expected = existing?.pdfUrl && !normalized.pdfUrl
        ? { ...normalized, pdfUrl: existing.pdfUrl }
        : normalized;

      if (existing && JSON.stringify(existing) === JSON.stringify(expected)) {
        unchanged += 1;
        continue;
      }

      await this.reportStore.upsert(normalized);
      imported += 1;
    }

    if (invalid > 0) {
      this.logger.warn?.(`Ignored ${invalid} invalid auto-published report(s)`);
    }

    return { status: 'synced', imported, unchanged, invalid };
  }
}
