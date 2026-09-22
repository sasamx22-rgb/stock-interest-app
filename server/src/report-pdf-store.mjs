import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ID_PATTERN = /^[A-Za-z0-9._-]{1,80}$/;

export class ReportPdfStore {
  constructor({ directory }) {
    this.directory = directory;
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
