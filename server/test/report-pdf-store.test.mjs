import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { REPORT_PDF_RETENTION_MS, ReportPdfStore } from '../src/report-pdf-store.mjs';

test('stores and reads PDF bytes by safe report id', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'market-pulse-pdf-'));

  try {
    const store = new ReportPdfStore({ directory });
    const bytes = Buffer.from('%PDF-1.4\nmock report\n%%EOF');

    const saved = await store.save('2026-09-22-morning', bytes);
    assert.equal(saved.size, bytes.length);
    assert.deepEqual(await store.read('2026-09-22-morning'), bytes);

    await store.remove('2026-09-22-morning');
    assert.equal(await store.read('2026-09-22-morning'), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects non-PDF content', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'market-pulse-pdf-'));
  try {
    const store = new ReportPdfStore({ directory });
    await assert.rejects(
      () => store.save('report-1', Buffer.from('not a pdf')),
      /not a PDF/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});


test('finds and removes only PDFs older than the 30-day retention window', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'market-pulse-pdf-'));

  try {
    const store = new ReportPdfStore({ directory });
    const bytes = Buffer.from('%PDF-1.4\nmock report\n%%EOF');
    const now = Date.now();

    await store.save('expired-report', bytes);
    await store.save('fresh-report', bytes);

    const expiredTime = new Date(now - REPORT_PDF_RETENTION_MS - 60_000);
    const freshTime = new Date(now - REPORT_PDF_RETENTION_MS + 60_000);
    await utimes(store.pathFor('expired-report'), expiredTime, expiredTime);
    await utimes(store.pathFor('fresh-report'), freshTime, freshTime);

    assert.deepEqual(await store.listExpiredIds(now), ['expired-report']);
    assert.equal(await store.isExpired('expired-report', now), true);
    assert.equal(await store.isExpired('fresh-report', now), false);
    assert.equal(await store.removeIfExpired('fresh-report', now), false);
    assert.equal(await store.removeIfExpired('expired-report', now), true);
    assert.equal(await store.read('expired-report'), null);
    assert.deepEqual(await store.read('fresh-report'), bytes);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
