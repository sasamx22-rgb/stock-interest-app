import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { GitHubReportSync } from '../src/github-report-sync.mjs';
import { ReportStore } from '../src/report-store.mjs';

test('GitHubReportSync imports reports and preserves an existing PDF link', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'market-pulse-report-sync-'));
  try {
    const store = new ReportStore({
      filePath: join(directory, 'reports.json'),
      defaults: [],
    });

    await store.upsert({
      id: '2026-09-28-morning',
      title: 'Old title',
      publishedAt: '2026-09-28T08:00:00+09:00',
      type: 'morning',
      summary: 'Old summary',
      tickers: [],
      pdfUrl: '/api/reports/2026-09-28-morning/pdf',
    });

    const manifest = [{
      id: '2026-09-28-morning',
      title: 'Updated title',
      publishedAt: '2026-09-28T08:00:00+09:00',
      type: 'morning',
      summary: 'Updated summary',
      marketSummary: 'Market detail',
      highlights: ['Point one'],
      tickers: ['삼성전자'],
    }];

    const fetchImpl = async () => new Response(JSON.stringify({
      type: 'file',
      encoding: 'base64',
      content: Buffer.from(JSON.stringify(manifest), 'utf8').toString('base64'),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

    const sync = new GitHubReportSync({
      reportStore: store,
      repository: 'sasamx22-rgb/stock-interest-app',
      ref: 'chatgpt/live-naver-market-data',
      filePath: 'auto-reports/reports.json',
      enabled: true,
      fetchImpl,
    });

    const result = await sync.syncIfDue({ force: true });
    assert.equal(result.status, 'synced');
    assert.equal(result.imported, 1);

    const report = await store.getById('2026-09-28-morning');
    assert.equal(report.title, 'Updated title');
    assert.equal(report.pdfUrl, '/api/reports/2026-09-28-morning/pdf');
    assert.deepEqual(report.tickers, ['삼성전자']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
