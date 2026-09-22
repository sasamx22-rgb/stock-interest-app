// A TTL check alone does not remove keys that are never requested again.
export class BoundedCache extends Map {
  constructor(maxEntries = 256) {
    super();
    this.maxEntries = maxEntries;
  }

  set(key, value) {
    this.delete(key);
    super.set(key, value);
    while (this.size > this.maxEntries) this.delete(this.keys().next().value);
    return this;
  }
}
