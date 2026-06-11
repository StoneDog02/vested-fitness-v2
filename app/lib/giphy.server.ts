export interface GifResult {
  id: string;
  title: string;
  previewUrl: string;
  url: string;
  width: number;
  height: number;
}

interface GiphyImage {
  url: string;
  width: string;
  height: string;
}

interface GiphyGif {
  id: string;
  title: string;
  images: {
    fixed_width: GiphyImage;
    downsized: GiphyImage;
  };
}

interface GiphyResponse {
  data: GiphyGif[];
  pagination?: { total_count: number; count: number; offset: number };
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { expires: number; gifs: GifResult[] }>();

function mapGif(gif: GiphyGif): GifResult {
  return {
    id: gif.id,
    title: gif.title,
    previewUrl: gif.images.fixed_width.url,
    url: gif.images.downsized?.url || gif.images.fixed_width.url,
    width: parseInt(gif.images.fixed_width.width, 10) || 200,
    height: parseInt(gif.images.fixed_width.height, 10) || 200,
  };
}

function getCached(key: string): GifResult[] | null {
  const entry = cache.get(key);
  if (!entry || entry.expires <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.gifs;
}

function setCache(key: string, gifs: GifResult[]) {
  cache.set(key, { gifs, expires: Date.now() + CACHE_TTL_MS });
}

export function getGiphyApiKey(): string | undefined {
  return process.env.GIPHY_API_KEY?.trim() || undefined;
}

export async function fetchGifs(options: {
  query?: string;
  offset?: number;
  limit?: number;
}): Promise<{ gifs: GifResult[]; configured: boolean }> {
  const apiKey = getGiphyApiKey();
  if (!apiKey) {
    return { gifs: [], configured: false };
  }

  const { query, offset = 0, limit = 24 } = options;
  const cacheKey = query?.trim()
    ? `search:${query.trim().toLowerCase()}:${offset}:${limit}`
    : `trending:${offset}:${limit}`;

  const cached = getCached(cacheKey);
  if (cached) {
    return { gifs: cached, configured: true };
  }

  const params = new URLSearchParams({
    api_key: apiKey,
    limit: String(Math.min(limit, 50)),
    offset: String(offset),
    rating: "pg-13",
  });

  const endpoint = query?.trim()
    ? `https://api.giphy.com/v1/gifs/search?${params}&q=${encodeURIComponent(query.trim())}`
    : `https://api.giphy.com/v1/gifs/trending?${params}`;

  const res = await fetch(endpoint);
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error("GIF search rate limit reached. Try again in a few minutes.");
    }
    throw new Error("Failed to load GIFs");
  }

  const data = (await res.json()) as GiphyResponse;
  const gifs = (data.data ?? []).map(mapGif);
  setCache(cacheKey, gifs);
  return { gifs, configured: true };
}
