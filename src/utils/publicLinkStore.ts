import fs from 'fs';
import path from 'path';

export interface PublicLinkOptions {
  allowDownload: boolean;
  permission: 'VIEW' | 'EDIT';
}

const SETTINGS_FILE = path.resolve(process.cwd(), 'public_settings.json');
let settingsCache: Record<string, PublicLinkOptions> = {};

// Load on startup
try {
  if (fs.existsSync(SETTINGS_FILE)) {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    settingsCache = JSON.parse(raw);
  }
} catch (e) {
  settingsCache = {};
}

function persist() {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settingsCache, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save public link settings:', e);
  }
}

export function setPublicLinkOptions(token: string, options: Partial<PublicLinkOptions>): void {
  if (!token) return;
  const existing = settingsCache[token] || { allowDownload: true, permission: 'VIEW' };
  settingsCache[token] = {
    allowDownload: options.allowDownload !== undefined ? Boolean(options.allowDownload) : existing.allowDownload,
    permission: options.permission === 'EDIT' ? 'EDIT' : 'VIEW',
  };
  persist();
}

export function getPublicLinkOptions(token: string): PublicLinkOptions {
  if (!token || !settingsCache[token]) {
    return { allowDownload: true, permission: 'VIEW' };
  }
  return settingsCache[token];
}

export function deletePublicLinkOptions(token: string): void {
  if (token && settingsCache[token]) {
    delete settingsCache[token];
    persist();
  }
}
