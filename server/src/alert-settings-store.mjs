import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { DEFAULT_ALERT_RULE } from './alerts.mjs';

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeAlertRule(value, fallback = DEFAULT_ALERT_RULE) {
  const changePercent = finiteNumber(value?.changePercent);
  const volumeRatio = finiteNumber(value?.volumeRatio);

  if (
    changePercent === null
    || volumeRatio === null
    || changePercent < 0.5
    || changePercent > 30
    || volumeRatio < 1
    || volumeRatio > 20
  ) {
    return { ...fallback };
  }

  return {
    changePercent: Math.round(changePercent * 10) / 10,
    volumeRatio: Math.round(volumeRatio * 10) / 10,
  };
}

export class AlertSettingsStore {
  constructor({ filePath, defaults = DEFAULT_ALERT_RULE }) {
    this.filePath = filePath;
    this.defaults = normalizeAlertRule(defaults, DEFAULT_ALERT_RULE);
  }

  async get() {
    try {
      const payload = JSON.parse(await readFile(this.filePath, 'utf8'));
      return normalizeAlertRule(payload, this.defaults);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      await this.save(this.defaults);
      return { ...this.defaults };
    }
  }

  async save(value) {
    const rule = normalizeAlertRule(value, this.defaults);
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(rule, null, 2)}\n`, 'utf8');
    return rule;
  }

  async update(value) {
    const changePercent = finiteNumber(value?.changePercent);
    const volumeRatio = finiteNumber(value?.volumeRatio);

    if (
      changePercent === null
      || volumeRatio === null
      || changePercent < 0.5
      || changePercent > 30
      || volumeRatio < 1
      || volumeRatio > 20
    ) {
      const error = new Error('Alert rule is out of range');
      error.statusCode = 400;
      throw error;
    }

    return this.save({ changePercent, volumeRatio });
  }
}
