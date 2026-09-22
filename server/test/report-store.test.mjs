import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ReportStore, normalizeReport } from '../src/report-store.mjs';

test('normalizes report payloads and safe PDF URLs', () => {
  const report = normalizeReport({
    id: '2026-09-22-morning',
    title: '모닝 브리프',
    publishedAt: '2026-09-22T08:00:00+09:00',
    type: 'morning',
    summary: '핵심 요약',
    tickers: ['삼성전자', '삼성전자', 'NVDA'],
    highlights: ['반도체 강세'],
    pdfUrl: 'https://example.com/report.pdf',
  });

  assert.equal(report.id, '2026-09-22-morning');
  assert.deepEqual(report.tickers, ['삼성전자', 'NVDA']);
  assert.equal(report.pdfUrl, 'https://example.com/report.pdf');
  assert.equal(
    normalizeReport({ ...report, pdfUrl: '/api/reports/2026-09-22-morning/pdf' }).pdfUrl,
    '/api/reports/2026-09-22-morning/pdf',
  );
  assert.equal(normalizeReport({ ...report, pdfUrl: 'file:///tmp/report.pdf' }).pdfUrl, undefined);
});

test('persists and upserts reports by id', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'market-pulse-report-'));
  const filePath = join(directory, 'reports.json');

  try {
    const store = new ReportStore({ filePath, defaults: [] });
    await store.upsert({
      id: '2026-09-22-morning',
      title: '첫 보고서',
      publishedAt: '2026-09-22T08:00:00+09:00',
      type: 'morning',
      summary: '첫 요약',
      tickers: ['삼성전자'],
    });

    await store.upsert({
      id: '2026-09-22-morning',
      title: '수정 보고서',
      publishedAt: '2026-09-22T08:00:00+09:00',
      type: 'morning',
      summary: '수정 요약',
      tickers: ['SK하이닉스'],
    });

    const reports = await store.getAll();
    assert.equal(reports.length, 1);
    assert.equal(reports[0].title, '수정 보고서');
    assert.equal((await store.getById('2026-09-22-morning')).summary, '수정 요약');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
