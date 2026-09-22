export class PushReceiptMonitor {
  constructor({
    receiptStore,
    getReceipts,
    removeToken,
    intervalMs = 5 * 60_000,
    minimumAgeMs = 15 * 60_000,
    maxAgeMs = 24 * 60 * 60_000,
    logger = console,
  }) {
    this.receiptStore = receiptStore;
    this.getReceipts = getReceipts;
    this.removeToken = removeToken;
    this.intervalMs = intervalMs;
    this.minimumAgeMs = minimumAgeMs;
    this.maxAgeMs = maxAgeMs;
    this.logger = logger;
    this.timer = null;
    this.inFlight = false;
  }

  async check() {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      const now = Date.now();
      const pending = (await this.receiptStore.getAll())
        .filter((item) => {
          const age = now - Date.parse(item.createdAt);
          return age >= this.minimumAgeMs && age <= this.maxAgeMs;
        })
        .slice(0, 300);
      if (pending.length === 0) return;

      const receipts = await this.getReceipts(pending.map((item) => item.id));
      const completed = [];
      for (const item of pending) {
        const receipt = receipts[item.id];
        if (!receipt) continue;
        if (receipt.status === 'ok') {
          completed.push(item.id);
          continue;
        }
        if (receipt.status === 'error') {
          completed.push(item.id);
          if (receipt.details?.error === 'DeviceNotRegistered') {
            await this.removeToken(item.token);
          } else {
            this.logger.warn?.('Expo push receipt error', {
              receiptId: item.id,
              error: receipt.details?.error ?? receipt.message ?? 'unknown',
            });
          }
        }
      }
      if (completed.length > 0) await this.receiptStore.remove(completed);

      const expired = (await this.receiptStore.getAll())
        .filter((item) => now - Date.parse(item.createdAt) > this.maxAgeMs)
        .map((item) => item.id);
      if (expired.length > 0) await this.receiptStore.remove(expired);
    } catch (error) {
      this.logger.error?.('Push receipt monitor failed', error);
    } finally {
      this.inFlight = false;
    }
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.check(), this.intervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  get active() {
    return Boolean(this.timer);
  }
}
