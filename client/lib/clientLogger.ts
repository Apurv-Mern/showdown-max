'use client';

type ClientLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ClientLogEntry {
  id: string;
  timestamp: string;
  level: ClientLogLevel;
  source: string;
  message: string;
  meta?: Record<string, unknown>;
}

declare global {
  interface Window {
    __SHOWDOWN_CLIENT_LOGS__?: ClientLogEntry[];
    __SHOWDOWN_DEBUG_ENABLED__?: boolean;
  }
}

const STORAGE_KEY = 'showdown:debug';
const MAX_LOGS = 250;

const canUseWindow = () => typeof window !== 'undefined';

const readDebugFlag = () => {
  if (!canUseWindow()) return process.env.NODE_ENV !== 'production';
  if (window.__SHOWDOWN_DEBUG_ENABLED__ !== undefined) {
    return Boolean(window.__SHOWDOWN_DEBUG_ENABLED__);
  }
  const stored = window.localStorage.getItem(STORAGE_KEY);
  const enabled = stored === '1' || process.env.NEXT_PUBLIC_DEBUG_LOGS === 'true';
  window.__SHOWDOWN_DEBUG_ENABLED__ = enabled;
  return enabled;
};

const shouldBufferLogs = () => {
  if (!canUseWindow()) return false;
  return readDebugFlag();
};

const getStore = () => {
  if (!canUseWindow()) return [];
  if (!window.__SHOWDOWN_CLIENT_LOGS__) {
    window.__SHOWDOWN_CLIENT_LOGS__ = [];
  }
  return window.__SHOWDOWN_CLIENT_LOGS__;
};

const writeConsole = (level: ClientLogLevel, message: string, meta?: Record<string, unknown>) => {
  const payload = meta ? [message, meta] : [message];
  if (level === 'error') console.error(...payload);
  else if (level === 'warn') console.warn(...payload);
  else if (level === 'info') console.info(...payload);
  else console.debug(...payload);
};

export const clientLogger = {
  log(level: ClientLogLevel, source: string, message: string, meta?: Record<string, unknown>) {
    const entry: ClientLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
      meta,
    };

    if (canUseWindow() && shouldBufferLogs()) {
      const logs = getStore();
      logs.push(entry);
      if (logs.length > MAX_LOGS) {
        logs.splice(0, logs.length - MAX_LOGS);
      }
    }

    if (readDebugFlag() || level === 'error' || level === 'warn') {
      writeConsole(level, `[${source}] ${message}`, meta);
    }

    return entry;
  },
  debug(source: string, message: string, meta?: Record<string, unknown>) {
    return this.log('debug', source, message, meta);
  },
  info(source: string, message: string, meta?: Record<string, unknown>) {
    return this.log('info', source, message, meta);
  },
  warn(source: string, message: string, meta?: Record<string, unknown>) {
    return this.log('warn', source, message, meta);
  },
  error(source: string, message: string, meta?: Record<string, unknown>) {
    return this.log('error', source, message, meta);
  },
  getEntries() {
    return [...getStore()].reverse();
  },
  isEnabled() {
    return readDebugFlag();
  },
  setEnabled(enabled: boolean) {
    if (!canUseWindow()) return;
    window.__SHOWDOWN_DEBUG_ENABLED__ = enabled;
    window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
    this.info('debug-panel', enabled ? 'Client debug enabled' : 'Client debug disabled');
  },
  clear() {
    if (!canUseWindow()) return;
    getStore().splice(0);
  },
};

export const getClientDebugEntries = () => clientLogger.getEntries();
