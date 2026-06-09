import https from 'https';

const RAPIDAPI_HOST = 'instagram120.p.rapidapi.com';
const API_ENDPOINT = 'https://instagram120.p.rapidapi.com/api/instagram/links';
const API_MEDIA_BY_SHORTCODE_ENDPOINT = '/api/instagram/mediaByShortcode';
const RAPIDAPI_RETRY_DELAYS_MS = [1500, 4000];

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRetryableInstagramError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();

  if (message.includes('rapidapi error: 429')) return false;
  if (message.includes('rapidapi error: 401') || message.includes('rapidapi error: 403')) return false;

  return (
    message.includes('link not found') ||
    message.includes('download link not found') ||
    message.includes('empty response') ||
    message.includes('empty array response') ||
    message.includes('rapidapi error: 500') ||
    message.includes('rapidapi error: 502') ||
    message.includes('rapidapi error: 503') ||
    message.includes('rapidapi error: 504') ||
    message.includes('fetch failed') ||
    message.includes('econnreset') ||
    message.includes('timeout')
  );
}

async function withInstagramRetry<T>(label: string, operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RAPIDAPI_RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const delayMs = RAPIDAPI_RETRY_DELAYS_MS[attempt];
      if (delayMs === undefined || !isRetryableInstagramError(error)) {
        throw error;
      }

      console.log(`[Instagram] ${label} failed, retrying in ${delayMs}ms: ${getErrorMessage(error)}`);
      await sleep(delayMs);
    }
  }

  throw lastError;
}

/**
 * Randomizes the case of each letter in the Instagram username
 * to bypass RapidAPI's response cache. Instagram usernames are
 * case-insensitive, but the API caches by exact URL string.
 */
function jitterInstagramUsernameCase(url: string): string {
  if (!url) return url;

  const marker = 'instagram.com/';
  const idx = url.indexOf(marker);
  if (idx === -1) return url;

  const prefix = url.substring(0, idx + marker.length);
  const rest = url.substring(idx + marker.length);

  let cut = rest.length;
  const slashIdx = rest.indexOf('/');
  if (slashIdx !== -1 && slashIdx < cut) cut = slashIdx;
  const qIdx = rest.indexOf('?');
  if (qIdx !== -1 && qIdx < cut) cut = qIdx;

  const username = rest.substring(0, cut);
  const suffix = rest.substring(cut);

  if (!username) return url;

  const newUsername = username
    .split('')
    .map((ch) => {
      if (/[a-zA-Z]/.test(ch)) {
        return Math.random() < 0.5 ? ch.toLowerCase() : ch.toUpperCase();
      }
      return ch;
    })
    .join('');

  const newUrl = prefix + newUsername + suffix;
  console.log('[Instagram] Cache-bust URL:', newUrl);
  return newUrl;
}

export interface InstagramPost {
  postKey: string;
  shortcode: string;
  username: string;
  caption: string;
  mediaUrls: string[];
  type: string;
  imageUrl: string;
  postUrl: string;
  takenAt: number;
}

export interface InstagramQuota {
  limit: number;
  remaining: number;
  resetSeconds: number;
}

export async function getLatestInstagramPost(usernameUrl: string, rapidApiKey: string): Promise<{ post: InstagramPost, quota: InstagramQuota }> {
  return withInstagramRetry('latest post fetch', async () => {
    const res = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-rapidapi-host': RAPIDAPI_HOST,
        'x-rapidapi-key': rapidApiKey,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: JSON.stringify({ url: jitterInstagramUsernameCase(usernameUrl) }),
    });

    if (!res.ok) {
      throw new Error(`RapidAPI Error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Empty response from Instagram API');
    }

    // Find latest by takenAt
    const latestItem = data.reduce((best: any, item: any) => {
      if (!item?.meta?.takenAt) return best;
      if (!best) return item;
      return item.meta.takenAt > best.meta.takenAt ? item : best;
    }, null) || data[0];

    const remaining = res.headers.get('x-ratelimit-requests-remaining') || '0';
    const limit = res.headers.get('x-ratelimit-requests-limit') || '0';
    const resetSeconds = res.headers.get('x-ratelimit-requests-reset') || '0';
    const quota = {
      limit: parseInt(limit, 10),
      remaining: parseInt(remaining, 10),
      resetSeconds: parseInt(resetSeconds, 10)
    };

    return { post: processInstagramItem(latestItem, data), quota };
  });
}

export async function getRecentInstagramPosts(usernameUrl: string, rapidApiKey: string): Promise<{ posts: InstagramPost[], quota: InstagramQuota }> {
  return withInstagramRetry('recent posts fetch', async () => {
    const res = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-rapidapi-host': RAPIDAPI_HOST,
        'x-rapidapi-key': rapidApiKey,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: JSON.stringify({ url: jitterInstagramUsernameCase(usernameUrl) }),
    });

    if (!res.ok) {
      throw new Error(`RapidAPI Error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Empty response from Instagram API');
    }

    // The endpoint returns a flat array of media items. Group them by shortcode/id to form distinct posts.
    const postsMap = new Map<string, any[]>();

    for (const item of data) {
      const sc = item?.meta?.shortcode || item?.meta?.id;
      if (!sc) continue;
      if (!postsMap.has(sc)) postsMap.set(sc, []);
      postsMap.get(sc)!.push(item);
    }

    const recentPosts: InstagramPost[] = [];

    for (const [sc, items] of postsMap.entries()) {
      // We treat the first item in the group as the main metadata source
      const mainItem = items[0];
      if (mainItem) {
        recentPosts.push(processInstagramItem(mainItem, data));
      }
    }

    // Sort them by takenAt descending (newest first)
    recentPosts.sort((a, b) => b.takenAt - a.takenAt);

    const remaining = res.headers.get('x-ratelimit-requests-remaining') || '0';
    const limit = res.headers.get('x-ratelimit-requests-limit') || '0';
    const resetSeconds = res.headers.get('x-ratelimit-requests-reset') || '0';
    const quota = {
      limit: parseInt(limit, 10),
      remaining: parseInt(remaining, 10),
      resetSeconds: parseInt(resetSeconds, 10)
    };

    return { posts: recentPosts, quota };
  });
}

export async function getInstagramPostByShortcode(shortcode: string, rapidApiKey: string): Promise<{ post: InstagramPost, quota: InstagramQuota }> {
  return withInstagramRetry('post by shortcode fetch', () => new Promise((resolve, reject) => {
    const postData = JSON.stringify({ shortcode });
    const options = {
      method: 'POST',
      hostname: RAPIDAPI_HOST,
      port: null,
      path: API_MEDIA_BY_SHORTCODE_ENDPOINT,
      headers: {
        'x-rapidapi-key': rapidApiKey,
        'x-rapidapi-host': RAPIDAPI_HOST,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, function (res) {
      const chunks: any[] = [];

      res.on('data', function (chunk) {
        chunks.push(chunk);
      });

      res.on('end', function () {
        if (res.statusCode && res.statusCode >= 400) {
          return reject(new Error(`RapidAPI Error: ${res.statusCode} ${Buffer.concat(chunks).toString()}`));
        }

        const body = Buffer.concat(chunks).toString();
        try {
          const data = JSON.parse(body);
          if (!data) return reject(new Error('Empty response from Instagram API'));

          // mediaByShortcode returns a single object directly sometimes, not an array.
          // Or if it IS an array, process first element. In the user's snippet, it returned an object for the first file, or array of them depending.
          const isArray = Array.isArray(data);
          if (isArray && data.length === 0) {
            return reject(new Error('Empty array response from Instagram API'));
          }

          // In the user's dumped log, the data was parsed as a single object if it's `{...}`, 
          // but if it's an array of objects `[{meta: ...}, {urls: ...}]`, we wrap it logically.
          // The snippet dumped by the user showed JSON starting with `{` then missing keys or array?
          // Wait, the user's snippet dumped an array of objects! `[{"meta":...}, {"urls":...}]` or similar judging from structure.

          // Actually, let's just use `processInstagramItem(firstItem, dataAsArray)`
          const dataArray = isArray ? data : [data];
          const firstItem = dataArray[0];

          const getHeader = (name: string) => Array.isArray(res.headers[name]) ? res.headers[name]?.[0] : res.headers[name];
          const remaining = getHeader('x-ratelimit-requests-remaining') || '0';
          const limit = getHeader('x-ratelimit-requests-limit') || '0';
          const resetSeconds = getHeader('x-ratelimit-requests-reset') || '0';
          const quota = {
            limit: parseInt(limit as string, 10),
            remaining: parseInt(remaining as string, 10),
            resetSeconds: parseInt(resetSeconds as string, 10)
          };

          resolve({ post: processInstagramItem(firstItem, dataArray), quota });
        } catch (e: any) {
          reject(new Error(`JSON Parse Error: ${e.message} | Body: ${body.slice(0, 100)}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.write(postData);
    req.end();
  }));
}

function processInstagramItem(item: any, allItems: any[]): InstagramPost {
  const meta = item.meta || {};
  const shortcode = meta.shortcode; // might be null if not found
  const username = meta.username || '';
  const postUrl = meta.sourceUrl || (shortcode ? `https://www.instagram.com/p/${shortcode}/` : '');

  // Filter items matching this shortcode (if logical)
  // In `getLatest`, response contains many posts. valid logic:
  const samePostItems = shortcode 
    ? allItems.filter(i => i.meta && i.meta.shortcode === shortcode)
    : [item];

  const mediaUrls = extractMediaUrls(samePostItems);
  const type = determinePostType(samePostItems);
  
  const imageUrl = item.pictureUrl || item.urls?.[0]?.url || '';
  const caption = meta.title || '';
  const takenAt = meta.takenAt || 0;
  
  const postKey = (meta.id && String(meta.id)) || 
    (shortcode && String(shortcode)) || 
                  (takenAt ? `takenAt_${takenAt}` : 'unknown');

  return {
    postKey,
    shortcode,
    username,
    caption,
    mediaUrls,
    type,
    imageUrl,
    postUrl,
    takenAt
  };
}

async function tryFetchUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getBestVideoUrl(originalUrl: string): Promise<string> {
  // Instagram CDN DASH streams (strext=1) contain video-only (no audio).
  // Try to get a full MP4 with audio by modifying URL parameters.
  if (!originalUrl.includes('strext=1')) return originalUrl;

  // Variant 1: Remove strext=1 entirely (let CDN decide format)
  const withoutStrext = originalUrl
    .replace('strext=1&', '')
    .replace('&strext=1', '')
    .replace('?strext=1&', '?')
    .replace('?strext=1', '');

  // Variant 2: Replace strext=1 with stp=dst-mp4 (explicit full MP4 request)
  const withDstMp4 = originalUrl.replace('strext=1', 'stp=dst-mp4');

  // Try variants in order
  for (const variant of [withoutStrext, withDstMp4]) {
    if (await tryFetchUrl(variant)) {
      return variant;
    }
  }

  // Fallback to original
  return originalUrl;
}

function extractMediaUrls(items: any[]): string[] {
  const fs = require('fs');
  const path = require('path');
  const logPath = path.join(process.cwd(), 'instagram-debug.log');
  let debugLog = `[${new Date().toISOString()}] extractMediaUrls called with ${items.length} items\n\n`;

  const result = items
    .map((item) => {
      const urls = item.urls;
      if (!urls || !urls.length) return null;
      const selectedUrl = urls[0]?.url;
      debugLog += `Selected url = ${selectedUrl?.substring(0, 150)}\n\n`;
      return selectedUrl;
    })
    .filter(Boolean);

  try {
    fs.writeFileSync(logPath, debugLog, 'utf-8');
  } catch (e) { }

  return result;
}

function determinePostType(items: any[]): string {
  let videoCount = 0;
  let imageCount = 0;

  items.forEach(item => {
    const ext = item.urls?.[0]?.extension?.toLowerCase();
    if (['mp4', 'mov', 'avi'].includes(ext)) {
      videoCount++;
    } else {
      imageCount++;
    }
  });

  const total = videoCount + imageCount;
  if (total <= 1) {
    return videoCount > 0 ? 'Reels' : 'Photo';
  } else {
    if (videoCount > 0 && imageCount > 0) return 'Carousel Mixed';
    if (videoCount > 0) return 'Carousel Video';
    return 'Carousel Photo';
  }
}
