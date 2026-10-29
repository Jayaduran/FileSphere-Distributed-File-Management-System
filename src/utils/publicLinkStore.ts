import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

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

const HMAC_SECRET = process.env.JWT_SECRET || 'filesphere-tamperproof-secret-salt-2026';

export function extractBaseToken(token: string): string {
  if (!token) return '';
  const clean = token.trim();
  const match = clean.match(/^(view|edit)-(.+)-([a-f0-9]{10})$/i);
  if (match) {
    return match[2];
  }
  return clean.replace(/^(view|edit)-/, '');
}

/**
 * Generate a cryptographically signed, tamper-proof share token.
 * Formats:
 *   - View link: view-<baseToken>-<sig>
 *   - Edit link: edit-<baseToken>-<sig>
 * Any modification to the mode or base token invalidates the cryptographic signature.
 */
export function createSignedShareToken(baseToken: string, permission: 'VIEW' | 'EDIT'): string {
  if (!baseToken) return '';
  const cleanBase = extractBaseToken(baseToken);
  const mode = permission === 'EDIT' ? 'edit' : 'view';
  const sig = crypto
    .createHmac('sha256', HMAC_SECRET)
    .update(`${cleanBase}:${permission}`)
    .digest('hex')
    .substring(0, 10);
  return `${mode}-${cleanBase}-${sig}`;
}

export interface VerifiedShareToken {
  cleanToken: string;
  enforcedPermission: 'VIEW' | 'EDIT' | null;
  isTampered: boolean;
}

/**
 * Verifies a token string.
 * Returns the underlying base token, any cryptographically enforced permission,
 * and whether tampering was detected.
 */
export function verifyShareToken(tokenInput: string): VerifiedShareToken {
  if (!tokenInput) {
    return { cleanToken: '', enforcedPermission: null, isTampered: false };
  }

  const raw = tokenInput.trim();
  const match = raw.match(/^(view|edit)-(.+)-([a-f0-9]{10})$/i);
  if (match) {
    const mode = match[1].toLowerCase() === 'edit' ? 'EDIT' : 'VIEW';
    const base = match[2];
    const givenSig = match[3];

    const expectedSig = crypto
      .createHmac('sha256', HMAC_SECRET)
      .update(`${base}:${mode}`)
      .digest('hex')
      .substring(0, 10);

    const givenBuf = Buffer.from(givenSig);
    const expectedBuf = Buffer.from(expectedSig);

    // Constant-time comparison to prevent timing attacks
    if (givenBuf.length === expectedBuf.length && crypto.timingSafeEqual(givenBuf, expectedBuf)) {
      return { cleanToken: base, enforcedPermission: mode, isTampered: false };
    } else {
      // Signature mismatch: someone tampered with the URL (e.g. changed view to edit)!
      return { cleanToken: base, enforcedPermission: null, isTampered: true };
    }
  }

  // Legacy or raw token / UUID
  const stripped = raw.replace(/^(view|edit)-/, '');
  return { cleanToken: stripped, enforcedPermission: null, isTampered: false };
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
