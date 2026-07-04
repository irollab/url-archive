const DB_NAME = 'url-archive-images';
const DB_VERSION = 1;
const STORE_NAME = 'images';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error('打开图片数据库失败'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

export async function saveImage(key: string, dataUrl: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(dataUrl, key);
    request.onerror = () => reject(request.error ?? new Error('保存图片失败'));
    request.onsuccess = () => resolve();
  });
}

export async function loadImage(key: string): Promise<string | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onerror = () => reject(request.error ?? new Error('读取图片失败'));
    request.onsuccess = () => resolve(request.result);
  });
}

export async function deleteImage(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(key);
    request.onerror = () => reject(request.error ?? new Error('删除图片失败'));
    request.onsuccess = () => resolve();
  });
}

export function isImageKey(url: string): boolean {
  return url.startsWith('idb://');
}

export function imageKey(url: string): string {
  return url.slice(6);
}

export function toImageKey(key: string): string {
  return `idb://${key}`;
}

export async function resolveImageUrl(url: string): Promise<string | undefined> {
  if (!url) return undefined;
  if (isImageKey(url)) {
    return loadImage(imageKey(url));
  }
  return url;
}

export function resizeImageFile(
  file: File,
  maxWidth: number,
  maxHeight: number,
  quality = 0.85,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = image;
      if (width > maxWidth) {
        height = Math.round(height * (maxWidth / width));
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = Math.round(width * (maxHeight / height));
        height = maxHeight;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('无法创建 canvas 上下文'));
        return;
      }
      ctx.drawImage(image, 0, 0, width, height);

      try {
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (error) {
        reject(error);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('加载图片失败'));
    };

    image.src = objectUrl;
  });
}
