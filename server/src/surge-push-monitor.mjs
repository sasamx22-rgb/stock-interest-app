export class SurgePushMonitor {
  constructor({
    loadAlerts,
    getTokens,
    sendPush,
    removeToken,
    intervalMs = 120_000,
    logger = console,
  }) {
    this.loadAlerts = loadAlerts;
    this.getTokens = getTokens;
    this.sendPush = sendPush;
    this.removeToken = removeToken;
    this.intervalMs = intervalMs;
    this.logger = logger;
    this.previousEligible = null;
    this.timer = null;
    this.inFlight = false;
  }

  async check() {
    if (this.inFlight) return { skipped: true };
    this.inFlight = true;

    try {
      const tokenItems = await this.getTokens();
      const tokens = tokenItems.map((item) => item.token);
      if (tokens.length === 0) {
        this.previousEligible = null;
        return { baseline: false, newAlerts: 0, sent: 0, noDevices: true };
      }

      const alerts = await this.loadAlerts();
      const current = new Set(alerts.map((item) => `${item.market}:${item.symbol}`));

      if (this.previousEligible === null) {
        this.previousEligible = current;
        return { baseline: true, newAlerts: 0, sent: 0 };
      }

      const newAlerts = alerts.filter(
        (item) => !this.previousEligible.has(`${item.market}:${item.symbol}`),
      );

      if (newAlerts.length === 0) {
        this.previousEligible = current;
        return { baseline: false, newAlerts: 0, sent: 0 };
      }

      const result = await this.sendPush(tokens, newAlerts);
      for (const token of result.invalidTokens ?? []) {
        await this.removeToken(token);
      }

      // Retain the previous baseline on total rejection so the next poll retries.
      if ((result.sent ?? 0) > 0) this.previousEligible = current;

      return {
        baseline: false,
        newAlerts: newAlerts.length,
        sent: result.sent ?? 0,
      };
    } catch (error) {
      this.logger.error?.('Surge push monitor failed', error);
      return { error: error instanceof Error ? error.message : String(error) };
    } finally {
      this.inFlight = false;
    }
  }

  start() {
    if (this.timer) return;
    void this.check();
    this.timer = setInterval(() => {
      void this.check();
    }, this.intervalMs);
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
