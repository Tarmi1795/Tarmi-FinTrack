
import React, { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import { inventoryService } from '../services/inventory';

// Signed-URL cache: paths are stable, URLs expire in 10 min — cache for 8.
const urlCache = new Map<string, { url: string; expires: number }>();

export const getCachedImageUrl = async (path: string): Promise<string | null> => {
  const hit = urlCache.get(path);
  if (hit && hit.expires > Date.now()) return hit.url;
  const url = await inventoryService.getImageUrl(path);
  if (url) urlCache.set(path, { url, expires: Date.now() + 8 * 60 * 1000 });
  return url;
};

export const invalidateImageUrl = (path: string) => urlCache.delete(path);

/** Item photo thumbnail: fetches a signed URL when a path exists, with fallback icon. */
export const ItemThumb: React.FC<{
  path?: string | null;
  size?: number; // px
  rounded?: string;
  className?: string;
}> = ({ path, size = 36, rounded = 'rounded-lg', className = '' }) => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!path) { setUrl(null); return; }
    getCachedImageUrl(path).then(u => { if (!cancelled) setUrl(u); });
    return () => { cancelled = true; };
  }, [path]);

  if (!path || !url) {
    return (
      <div
        className={`${rounded} bg-gray-800/80 border border-gray-700/60 flex items-center justify-center text-gray-600 shrink-0 ${className}`}
        style={{ width: size, height: size }}
      >
        <Package size={Math.max(12, Math.round(size * 0.45))} />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      className={`${rounded} object-cover border border-gray-700/60 shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  );
};
