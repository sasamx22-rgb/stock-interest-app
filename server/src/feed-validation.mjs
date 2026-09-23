// An unrecognized payload is unavailable, not proof of an empty market.
export function hasFeedError(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(hasFeedError);
  if (value.error || (Array.isArray(value.errors) ? value.errors.length : value.errors)
      || value.success === false || value.status === 'error') return true;
  return Object.values(value).some(hasFeedError);
}

const CONTAINERS = new Set(['data', 'result', 'items', 'rows', 'stocks', 'prices', 'news', 'list', 'content']);
function isExplicitEmpty(value) {
  if (Array.isArray(value)) return value.length === 0;
  if (!value || typeof value !== 'object') return false;
  const children = Object.entries(value).filter(([key]) => CONTAINERS.has(key));
  return children.length > 0 && children.every(([, child]) => isExplicitEmpty(child));
}

export function assertFeedResult(payload, items, label) {
  if (hasFeedError(payload) || (items.length === 0 && !isExplicitEmpty(payload))) {
    throw new Error(`${label} response could not be normalized`);
  }
}
