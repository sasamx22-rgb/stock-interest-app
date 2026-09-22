import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

function dateKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export class AiBudgetStore {
  constructor({ filePath, dailyLimit = 12 }) {
    this.filePath = filePath;
    this.dailyLimit = Math.max(0, Number(dailyLimit) || 0);
    this.reserveQueue = Promise.resolve();
  }

  async get(now = new Date()) {
    const today = dateKey(now);
    try {
      const value = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (value?.date !== today) {
        return { date: today, calls: 0, dailyLimit: this.dailyLimit };
      }
      return {
        date: today,
        calls: Math.max(0, Number(value.calls) || 0),
        dailyLimit: this.dailyLimit,
      };
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return { date: today, calls: 0, dailyLimit: this.dailyLimit };
      }
      throw error;
    }
  }

  async reserve(now = new Date()) {
    const operation = this.reserveQueue.then(async () => {
      const state = await this.get(now);
      if (state.calls >= this.dailyLimit) {
        return { allowed: false, ...state };
      }

      const next = {
        date: state.date,
        calls: state.calls + 1,
        dailyLimit: this.dailyLimit,
      };
      await mkdir(dirname(this.filePath), { recursive: true });
      await writeFile(
        this.filePath,
        `${JSON.stringify({ date: next.date, calls: next.calls }, null, 2)}\n`,
        'utf8',
      );
      return { allowed: true, ...next };
    });

    this.reserveQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }
}
