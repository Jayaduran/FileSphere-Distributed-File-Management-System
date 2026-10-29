import fs from 'fs';
import path from 'path';

export interface AccessRecord {
  id: string;
  fileId: string;
  action: 'VIEW' | 'DOWNLOAD' | 'EDIT' | 'OPEN';
  actor: string;
  actorEmail?: string;
  isOwner?: boolean;
  timestamp: string;
  ip?: string;
  userAgent?: string;
}

const HISTORY_FILE = path.resolve(process.cwd(), 'access_history.json');
let historyCache: AccessRecord[] = [];

// Load existing access history
try {
  if (fs.existsSync(HISTORY_FILE)) {
    const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
    historyCache = JSON.parse(raw);
  }
} catch (e) {
  historyCache = [];
}

let saveTimeout: NodeJS.Timeout | null = null;
function schedulePersist() {
  if (saveTimeout) return;
  saveTimeout = setTimeout(() => {
    saveTimeout = null;
    try {
      // Keep most recent 5,000 records to maintain high performance
      if (historyCache.length > 5000) {
        historyCache = historyCache.slice(-5000);
      }
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(historyCache, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save access history:', e);
    }
  }, 1000);
}

export function recordAccess(record: Omit<AccessRecord, 'id' | 'timestamp'>): void {
  try {
    const newEntry: AccessRecord = {
      ...record,
      id: Math.random().toString(36).substring(2, 11),
      timestamp: new Date().toISOString(),
    };
    historyCache.unshift(newEntry);
    schedulePersist();
  } catch (e) {
    console.error('recordAccess error:', e);
  }
}

export function getAccessHistoryForFile(fileId: string): AccessRecord[] {
  return historyCache.filter((r) => r.fileId === fileId);
}

export function getAccessHistoryForFolder(folderId: string): AccessRecord[] {
  return historyCache.filter((r) => r.fileId === folderId);
}
