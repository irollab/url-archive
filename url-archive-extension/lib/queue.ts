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
    await db.add(STORE, item);
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
