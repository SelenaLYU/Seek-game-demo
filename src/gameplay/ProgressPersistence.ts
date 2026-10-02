/** Shared persistence boundary for saveable gameplay state. */
const volatileValues = new Map<string, { raw: string; persistent: boolean }>();

export function readProgress<T>(
  key: string,
  fallback: () => T,
  normalize: (value: unknown) => T,
): T {
  const cached = volatileValues.get(key);
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    raw = cached?.raw ?? null;
  }
  // A denied/quota-exceeded write is newer than the older value still readable from storage.
  if (cached && !cached.persistent) raw = cached.raw;

  if (raw === null) return fallback();
  try {
    const value = normalize(JSON.parse(raw) as unknown);
    const normalizedRaw = JSON.stringify(value);
    if (typeof normalizedRaw === 'string') {
      volatileValues.set(key, { raw: normalizedRaw, persistent: cached?.persistent ?? true });
    }
    return value;
  } catch {
    return fallback();
  }
}

/** Keeps the newest value for scene restarts even when browser storage is unavailable. */
export function writeProgress<T>(key: string, value: T): boolean {
  let raw: string;
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== 'string') return false;
    raw = serialized;
  } catch {
    return false;
  }
  volatileValues.set(key, { raw, persistent: false });
  try {
    window.localStorage.setItem(key, raw);
    volatileValues.set(key, { raw, persistent: true });
    return true;
  } catch {
    volatileValues.set(key, { raw, persistent: false });
    return false;
  }
}
