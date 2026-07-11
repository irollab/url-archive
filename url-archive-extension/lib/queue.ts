import { openDB, type IDBPDatabase } from 'idb';
import type { QueueItem } from './types';

const STORE = 'clips';

export class ClipQueue {
  private dbPromise: Promise<IDBPDatabase>;

  constructor(dbName = 'url-archive-queue') {
    this.dbPromise = openDB(dbName, 1, {
      upgrade(db) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      },
    });
  }

  async enqueue(item: QueueItem): Promise<void> {
    const db = await this.dbPromise;
    // 同 path 去重：先删旧项，避免离线期间同一剪藏（先写占位 + 补 AI 覆盖）堆积多条
    const tx = db.transaction(STORE, 'readwrite');
    const existing = await tx.store.getAll() as QueueItem[];
    for (const old of existing) {
      if (old.path === item.path && old.id != null) await tx.store.delete(old.id);
    }
    await tx.store.add(item);
    await tx.done;
  }

  async getAll(): Promise<QueueItem[]> {
    const db = await this.dbPromise;
    return db.getAll(STORE);
  }

  async remove(id: number): Promise<void> {
    const db = await this.dbPromise;
    await db.delete(STORE, id);
  }
}
