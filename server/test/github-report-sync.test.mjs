import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { GitHubReportSync } from '../src/github-report-sync.mjs';
import { ReportPdfStore } from '../src/report-pdf-store.mjs';
import { ReportStore } from '../src/report-store.mjs';

function manifestResponse(manifest) {
  return new Response(JSON.stringify({
    type: 'file',
    encoding: 'base64',
    content: Buffer.from(JSON.stringify(manifest), 'utf8').toString('base64'),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('GitHubReportSync imports report metadata and preserves an existing PDF link', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'market-pulse-report-sync-'));
  try {
    const store = new ReportStore({
      filePath: join(directory, 'reports.json'),
      defaults: [],
    });

    await store.upsert({
      id: '2026-09-28-morning',
      title: 'Old title',
      publishedAt: new Date().toISOString(),
      type: 'morning',
      summary: 'Old summary',
      tickers: [],
      pdfUrl: '/api/reports/2026-09-28-morning/pdf',
    });

    const manifest = [{
      id: '2026-09-28-morning',
      title: 'Updated title',
      publishedAt: new Date().toISOString(),
      type: 'morning',
      summary: 'Updated summary',
      marketSummary: 'Market detail',
      highlights: ['Point one'],
      tickers: ['삼성전자'],
    }];

    const sync = new GitHubReportSync({
      reportStore: store,
      repository: 'sasamx22-rgb/stock-interest-app',
      ref: 'chatgpt/live-naver-market-data',
      filePath: 'auto-reports/reports.json',
      enabled: true,
      fetchImpl: async () => manifestResponse(manifest),
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

test('GitHubReportSync downloads base64 PDF parts and connects the app PDF URL', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'market-pulse-report-pdf-sync-'));
  try {
    const store = new ReportStore({
      filePath: join(directory, 'reports.json'),
      defaults: [],
    });
    const pdfStore = new ReportPdfStore({
      directory: join(directory, 'report-pdfs'),
    });

    const pdfBytes = Buffer.from('%PDF-1.4\nmock report pdf\n%%EOF\n', 'ascii');
    const pdfBase64 = pdfBytes.toString('base64');
    const midpoint = Math.floor(pdfBase64.length / 8) * 4;
    const parts = [
      pdfBase64.slice(0, midpoint),
      pdfBase64.slice(midpoint),
    ];
    const manifest = [{
      id: '2026-09-29-morning',
      title: 'Morning report',
      publishedAt: new Date().toISOString(),
      type: 'morning',
      summary: 'Summary',
      tickers: ['NVDA'],
      pdfSourceVersion: '2026-09-29T08:10:00+09:00',
      pdfBase64Parts: [
        'auto-reports/pdfs/2026-09-29-morning.part001.b64',
        'auto-reports/pdfs/2026-09-29-morning.part002.b64',
      ],
    }];

    const fetchImpl = async (url, options = {}) => {
      const value = String(url);
      if (value.includes('auto-reports/reports.json')) {
        return manifestResponse(manifest);
      }
      const raw = options.headers?.Accept === 'application/vnd.github.raw+json';
      assert.equal(raw, true);
      if (value.includes('part001.b64')) return new Response(parts[0], { status: 200 });
      if (value.includes('part002.b64')) return new Response(parts[1], { status: 200 });
      return new Response('missing', { status: 404 });
    };

    const sync = new GitHubReportSync({
      reportStore: store,
      reportPdfStore: pdfStore,
      repository: 'sasamx22-rgb/stock-interest-app',
      ref: 'chatgpt/live-naver-market-data',
      filePath: 'auto-reports/reports.json',
      enabled: true,
      fetchImpl,
    });

    const result = await sync.syncIfDue({ force: true });
    assert.equal(result.pdfImported, 1);
    assert.equal(result.pdfErrors, 0);

    const report = await store.getById('2026-09-29-morning');
    assert.equal(report.pdfUrl, '/api/reports/2026-09-29-morning/pdf');
    assert.equal(report.pdfSourceVersion, '2026-09-29T08:10:00+09:00');

    const savedPdf = await pdfStore.read('2026-09-29-morning');
    assert.deepEqual(savedPdf, pdfBytes);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
