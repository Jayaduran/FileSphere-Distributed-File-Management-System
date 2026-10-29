import path from 'path';

/**
 * Sanitizes an incoming file name to prevent directory traversal and null-byte injection attacks.
 */
export function sanitizeFileName(name: string): string {
  if (!name || typeof name !== 'string') return 'unnamed_file';
  // Strip null bytes, path traversal sequences, and forbidden filesystem characters
  let clean = name
    .replace(/\0/g, '')
    .replace(/(\.\.[\/\\])/g, '')
    .replace(/[\/\\]/g, '_')
    .trim();

  // Strip leading and trailing dots
  clean = clean.replace(/^\.+|\.+$/g, '').trim();

  if (!clean) clean = 'unnamed_file';
  // Limit to max 255 chars
  return clean.substring(0, 255);
}

/**
 * Sanitizes a folder name.
 */
export function sanitizeFolderName(name: string): string {
  if (!name || typeof name !== 'string') return 'New Folder';
  let clean = name
    .replace(/\0/g, '')
    .replace(/(\.\.[\/\\])/g, '')
    .replace(/[\/\\]/g, '_')
    .trim();

  clean = clean.replace(/^\.+|\.+$/g, '').trim();
  if (!clean) clean = 'New Folder';
  return clean.substring(0, 100);
}

/**
 * In-memory sliding window rate limiter to protect public endpoints against flooding and brute-force.
 */
interface RateRecord {
  timestamps: number[];
}
const rateMap = new Map<string, RateRecord>();

// Cleanup stale records every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateMap.entries()) {
    record.timestamps = record.timestamps.filter(t => now - t < 60000);
    if (record.timestamps.length === 0) {
      rateMap.delete(key);
    }
  }
}, 300000);

export function checkRateLimit(ipOrKey: string, action: string, maxRequestsPerMinute: number = 60): boolean {
  if (!ipOrKey) return true;
  const key = `${ipOrKey}:${action}`;
  const now = Date.now();
  let record = rateMap.get(key);
  if (!record) {
    record = { timestamps: [] };
    rateMap.set(key, record);
  }
  record.timestamps = record.timestamps.filter(t => now - t < 60000);
  if (record.timestamps.length >= maxRequestsPerMinute) {
    return false; // Rate limit exceeded
  }
  record.timestamps.push(now);
  return true;
}
