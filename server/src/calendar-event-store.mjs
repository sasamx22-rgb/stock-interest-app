import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const MAX_EVENTS = 800;
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,120}$/;
const VALID_TYPES = new Set(['macro', 'fomc', 'earnings', 'dividend', 'filing', 'custom']);

function text(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function stringArray(value, maxItems = 20) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => text(item, 40)).filter(Boolean))].slice(0, maxItems);
}

export function normalizeCalendarEvent(value) {
  if (!value || typeof value !== 'object') return null;

  const id = text(value.id, 120);
  const title = text(value.title, 240);
  const type = text(value.type, 30);
  const startsAt = text(value.startsAt, 80);
  const parsed = Date.parse(startsAt);

  if (!ID_PATTERN.test(id) || !title || !VALID_TYPES.has(type) || !Number.isFinite(parsed)) {
    return null;
  }

  return {
    id,
    title,
    type,
    startsAt: new Date(parsed).toISOString(),
    market: ['KR', 'US', 'GLOBAL'].includes(value.market) ? value.market : 'GLOBAL',
    importance: ['high', 'medium', 'low'].includes(value.importance) ? value.importance : 'medium',
    tickers: stringArray(value.tickers),
    source: text(value.source, 80) || 'manual',
    ...(text(value.description, 1000) ? { description: text(value.description, 1000) } : {}),
    ...(text(value.url, 1000) ? { url: text(value.url, 1000) } : {}),
  };
}

function sortEvents(items) {
  return [...items].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

export class CalendarEventStore {
  constructor({ filePath }) {
    this.filePath = filePath;
  }

  async getAll() {
    try {
      const payload = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (!Array.isArray(payload)) throw new Error('Calendar file must contain an array');

      const seen = new Set();
      return sortEvents(payload.flatMap((item) => {
        const event = normalizeCalendarEvent(item);
        if (!event || seen.has(event.id)) return [];
        seen.add(event.id);
        return [event];
      })).slice(0, MAX_EVENTS);
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
  }

  async save(items) {
    const normalized = sortEvents(items).slice(0, MAX_EVENTS);
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    return normalized;
  }

  async upsert(value) {
    const event = normalizeCalendarEvent(value);
    if (!event) {
      const error = new Error('Invalid calendar event');
      error.statusCode = 400;
      throw error;
    }

    const items = await this.getAll();
    await this.save([event, ...items.filter((item) => item.id !== event.id)]);
    return event;
  }
}
