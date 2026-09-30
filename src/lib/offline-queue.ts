"use client";

import { PendingLead } from "./types";

/**
 * The offline lead queue.
 *
 * Lives in IndexedDB rather than localStorage for one reason that matters: a
 * service worker can read IndexedDB, so the queue can be flushed by a
 * background sync even when no tab is open. localStorage is invisible to a
 * worker, which is why a queued lead used to sit until someone reopened
 * /collect.
 *
 * Everything here degrades to localStorage when IndexedDB is unavailable
 * (private windows, older WebViews) — a slightly worse queue is fine, a lost
 * lead is not.
 *
 * Reads are served from an in-memory mirror so the UI can render a count
 * synchronously; writes go to storage first, then refresh the mirror.
 */

const DB_NAME = "eventbuddy-offline";
const DB_VERSION = 1;
const STORE = "pending_leads";
/** Where the queue lived before IndexedDB. Drained once, on init. */
const LEGACY_KEY = "eventpal:pending_leads:v1";

let mirror: PendingLead[] = [];
let ready = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => {
    try { fn(); } catch { /* a bad subscriber must not stall the queue */ }
  });
}

/** Subscribe to queue changes (useSyncExternalStore-shaped). */
export function subscribeQueue(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Synchronous snapshot for rendering. Empty until initQueue() resolves. */
export function queueSnapshot(): PendingLead[] {
  return mirror;
}

export function queueReady(): boolean {
  return ready;
}

// ---- IndexedDB plumbing -----------------------------------------------------

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    // Some private-mode browsers never fire either handler.
    setTimeout(() => resolve(null), 3000);
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const t = db.transaction(STORE, mode);
          const req = run(t.objectStore(STORE));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      })
  );
}

// ---- localStorage fallback --------------------------------------------------

function lsRead(): PendingLead[] {
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    return raw ? (JSON.parse(raw) as PendingLead[]) : [];
  } catch {
    return [];
  }
}

function lsWrite(list: PendingLead[]) {
  try { window.localStorage.setItem(LEGACY_KEY, JSON.stringify(list)); } catch { /* quota or blocked */ }
}

let usingFallback = false;

// ---- public API -------------------------------------------------------------

async function readAll(): Promise<PendingLead[]> {
  if (usingFallback) return lsRead();
  const rows = await tx<PendingLead[]>("readonly", (s) => s.getAll() as IDBRequest<PendingLead[]>);
  if (rows === null) { usingFallback = true; return lsRead(); }
  return rows;
}

async function refresh() {
  mirror = (await readAll()).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  emit();
}

/** Opens the store, drains any pre-IndexedDB queue, and fills the mirror. */
export async function initQueue(): Promise<void> {
  if (typeof window === "undefined") return;
  const db = await openDb();
  usingFallback = !db;

  if (!usingFallback) {
    const legacy = lsRead();
    if (legacy.length) {
      for (const lead of legacy) {
        await tx("readwrite", (s) => s.put(lead));
      }
      // Only clear once the rows are safely in IndexedDB.
      try { window.localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
    }
  }

  ready = true;
  await refresh();
}

export async function enqueue(lead: PendingLead): Promise<void> {
  if (usingFallback) lsWrite([...lsRead().filter((l) => l.id !== lead.id), lead]);
  else if ((await tx("readwrite", (s) => s.put(lead))) === null) {
    usingFallback = true;
    lsWrite([...lsRead().filter((l) => l.id !== lead.id), lead]);
  }
  await refresh();
}

export async function dequeue(id: string): Promise<void> {
  if (usingFallback) lsWrite(lsRead().filter((l) => l.id !== id));
  else await tx("readwrite", (s) => s.delete(id));
  await refresh();
}

/** Record an attempt against a queued lead (attempts / lastAttempt). */
export async function markAttempt(lead: PendingLead): Promise<void> {
  const next: PendingLead = { ...lead, attempts: lead.attempts + 1, lastAttempt: new Date().toISOString() };
  if (usingFallback) lsWrite(lsRead().map((l) => (l.id === next.id ? next : l)));
  else await tx("readwrite", (s) => s.put(next));
  await refresh();
}
