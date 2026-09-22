import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const queues = new Map();
const context = new AsyncLocalStorage();

// One Node process only. Multiple replicas must use a transactional database.
export function withFileLock(filePath, operation) {
  const key = resolve(filePath);
  const held = context.getStore();
  if (held?.has(key)) return operation();
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.then(() => context.run(new Set([...(held ?? []), key]), operation));
  const settled = next.then(() => undefined, () => undefined);
  queues.set(key, settled);
  void settled.then(() => {
    if (queues.get(key) === settled) queues.delete(key);
  });
  return next;
}

// Include reads so missing-file initialization cannot overwrite a concurrent write.
// Nested store calls share the lock; separate instances share the path queue.
export function serializeFileOperations(store, methods) {
  for (const method of methods) {
    const original = store[method].bind(store);
    store[method] = (...args) => withFileLock(store.filePath, () => original(...args));
  }
}

export async function atomicWriteFile(filePath, data, options) {
  await mkdir(dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(data, options);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, filePath);
    // Persist the rename as well as the file contents on the Linux deployment.
    if (process.platform !== 'win32') {
      const directory = await open(dirname(filePath), 'r');
      try { await directory.sync(); } finally { await directory.close(); }
    }
  } finally {
    await handle?.close();
    await rm(temporary, { force: true });
  }
}
