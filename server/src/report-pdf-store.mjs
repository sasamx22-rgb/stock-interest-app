import { atomicWriteFile as writeFile } from './file-storage.mjs';
import { mkdir, readFile, readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const ID_PATTERN = /^[A-Za-z0-9._-]{1,80}$/;
export const REPORT_PDF_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export class ReportPdfStore {
  constructor({ directory, retentionMs = REPORT_PDF_RETENTION_MS }) {
    this.directory = directory;
    this.retentionMs = retentionMs;
  }

  pathFor(id) {
    if (!ID_PATTERN.test(id)) {
      const error = new Error('Invalid report id');
      error.statusCode = 400;
      throw error;
    }
    return join(this.directory, `${id}.pdf`);
  }

  async save(id, bytes) {
    if (!Buffer.isBuffer(bytes) || bytes.length < 5 || bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
      const error = new Error('Payload is not a PDF file');
      error.statusCode = 400;
      throw error;
    }

    await mkdir(this.directory, { recursive: true });
    await writeFile(this.pathFor(id), bytes);
    return { size: bytes.length };
  }

  async read(id) {
    try {
      return await readFile(this.pathFor(id));
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  async listExpiredIds(now = Date.now()) {
    let entries;
    try {
      entries = await readdir(this.directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }

    const cutoff = now - this.retentionMs;
    const expired = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.pdf')) continue;
      const id = entry.name.slice(0, -4);
      if (!ID_PATTERN.test(id)) continue;

      try {
        const metadata = await stat(this.pathFor(id));
        if (metadata.mtimeMs <= cutoff) expired.push(id);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }

    return expired.sort();
  }

  async removeIfExpired(id, now = Date.now()) {
    const filePath = this.pathFor(id);
    try {
      const metadata = await stat(filePath);
      if (metadata.mtimeMs > now - this.retentionMs) return false;
      await unlink(filePath);
      return true;
    } catch (error) {
      if (error?.code === 'ENOENT') return false;
      throw error;
    }
  }

  async remove(id) {
    try {
      await unlink(this.pathFor(id));
      return true;
    } catch (error) {
      if (error?.code === 'ENOENT') return false;
      throw error;
    }
  }
}
