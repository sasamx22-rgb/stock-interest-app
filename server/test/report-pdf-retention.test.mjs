import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ReportPdfStore, REPORT_PDF_RETENTION_MS } from '../src/report-pdf-store.mjs';
import { cleanupExpiredReportPdfs } from '../src/report-pdf-retention.mjs';
import { ReportStore } from '../src/report-store.mjs';

test('cleanup removes expired PDF bytes and clears only the PDF link', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'market-pulse-retention-'));
  const pdfDirectory = join(directory, 'report-pdfs');
  const reportStore = new ReportStore({
    filePath: join(directory, 'reports.json'),
    defaults: [],
  });
  const reportPdfStore = new ReportPdfStore({ directory: pdfDirectory });

  try {
    await reportStore.upsert({
      id: '2026-08-01-morning',
      title: '보관 기한 경과 보고서',
      publishedAt: '2026-08-01T08:00:00+09:00',
      type: 'morning',
      summary: '요약은 계속 보관합니다.',
    });
    await reportPdfStore.save(
      '2026-08-01-morning',
      Buffer.from('%PDF-1.4\nexpired report\n%%EOF'),
    );
    await reportStore.upsert({
      ...(await reportStore.getById('2026-08-01-morning')),
      pdfUrl: '/api/reports/2026-08-01-morning/pdf',
    });

    const now = Date.now();
    const expiredTime = new Date(now - REPORT_PDF_RETENTION_MS - 60_000);
    await utimes(
      reportPdfStore.pathFor('2026-08-01-morning'),
      expiredTime,
      expiredTime,
    );

    const lockedIds = [];
    const removedIds = await cleanupExpiredReportPdfs({
      reportPdfStore,
      reportStore,
      now,
      withReportLock: async (id, operation) => {
        lockedIds.push(id);
        return operation();
      },
    });

    assert.deepEqual(lockedIds, ['2026-08-01-morning']);
    assert.deepEqual(removedIds, ['2026-08-01-morning']);
    assert.equal(await reportPdfStore.read('2026-08-01-morning'), null);

    const report = await reportStore.getById('2026-08-01-morning');
    assert.equal(report.title, '보관 기한 경과 보고서');
    assert.equal(report.summary, '요약은 계속 보관합니다.');
    assert.equal(report.pdfUrl, undefined);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('cleanup rechecks expiry inside the report lock before deleting', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'market-pulse-retention-'));
  const pdfDirectory = join(directory, 'report-pdfs');
  const reportStore = new ReportStore({
    filePath: join(directory, 'reports.json'),
    defaults: [],
  });
  const reportPdfStore = new ReportPdfStore({ directory: pdfDirectory });

  try {
    await reportStore.upsert({
      id: '2026-08-02-morning',
      title: '재업로드 보고서',
      publishedAt: '2026-08-02T08:00:00+09:00',
      type: 'morning',
      summary: '새 PDF는 유지되어야 합니다.',
      pdfUrl: '/api/reports/2026-08-02-morning/pdf',
    });
    const oldBytes = Buffer.from('%PDF-1.4\nold report\n%%EOF');
    const freshBytes = Buffer.from('%PDF-1.4\nfresh report\n%%EOF');
    await reportPdfStore.save('2026-08-02-morning', oldBytes);

    const now = Date.now();
    const expiredTime = new Date(now - REPORT_PDF_RETENTION_MS - 60_000);
    await utimes(
      reportPdfStore.pathFor('2026-08-02-morning'),
      expiredTime,
      expiredTime,
    );

    const removedIds = await cleanupExpiredReportPdfs({
      reportPdfStore,
      reportStore,
      now,
      withReportLock: async (_id, operation) => {
        await reportPdfStore.save('2026-08-02-morning', freshBytes);
        return operation();
      },
    });

    assert.deepEqual(removedIds, []);
    assert.deepEqual(await reportPdfStore.read('2026-08-02-morning'), freshBytes);
    assert.equal(
      (await reportStore.getById('2026-08-02-morning')).pdfUrl,
      '/api/reports/2026-08-02-morning/pdf',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
