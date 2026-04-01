import type { MonthlyDataset } from "./types";

const TTL_CURRENT_MS = 120 * 60 * 1000; // 120分（当月）
const TTL_PAST_MS = 24 * 60 * 60 * 1000; // 24時間（過去月）
const MAX_SIZE = 6;

interface CacheEntry {
  data: MonthlyDataset;
  fetchedAt: number;
}

// Map はイテレーション順が挿入順なので LRU として使える
const cache = new Map<string, CacheEntry>();

function todayMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getTtl(monthKey: string): number {
  return monthKey === todayMonthKey() ? TTL_CURRENT_MS : TTL_PAST_MS;
}

/** キャッシュから取得。期限切れ or 未存在なら null */
export function cacheGet(monthKey: string): MonthlyDataset | null {
  const entry = cache.get(monthKey);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > getTtl(monthKey)) {
    cache.delete(monthKey);
    return null;
  }
  // 最近使用として末尾へ移動（LRU）
  cache.delete(monthKey);
  cache.set(monthKey, entry);
  return entry.data;
}

/** キャッシュに保存。6件超えたら最古（LRU）を削除 */
export function cacheSet(monthKey: string, data: MonthlyDataset): void {
  if (cache.has(monthKey)) cache.delete(monthKey);
  if (cache.size >= MAX_SIZE) {
    const lruKey = cache.keys().next().value;
    if (lruKey !== undefined) cache.delete(lruKey);
  }
  cache.set(monthKey, { data, fetchedAt: Date.now() });
}

/** 特定月のキャッシュを無効化（保存・削除後のrefetch用） */
export function cacheInvalidate(monthKey: string): void {
  cache.delete(monthKey);
}

/** 全キャッシュをクリア（ログアウト時） */
export function cacheClear(): void {
  cache.clear();
}
