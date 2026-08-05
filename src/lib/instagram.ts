import { execFile } from 'child_process';

const RAPIDAPI_HOST = 'instagram120.p.rapidapi.com';
const API_ENDPOINT = 'https://instagram120.p.rapidapi.com/api/instagram/links';
const API_MEDIA_BY_SHORTCODE_ENDPOINT = `https://${RAPIDAPI_HOST}/api/instagram/mediaByShortcode`;
const RAPIDAPI_RETRY_DELAYS_MS = [1500, 4000];
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'avi', 'webm'];
const FFMPEG_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function execFileAsync(file: string, args: string[], timeout: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function isRetryableInstagramError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();

  if (
    message.includes('link not found') ||
    message.includes('download link not found') ||
    message.includes('rapidapi error: 404')
  ) return false;
  if (message.includes('rapidapi error: 429')) return false;
  if (message.includes('rapidapi error: 401') || message.includes('rapidapi error: 403')) return false;

  return (
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

type InstagramProcessOptions = {
  rapidApiKey?: string;
  allowShortcodeFallback?: boolean;
};

type ResolveAudioSafeMediaParams = {
  mediaUrls: string[];
  rapidApiKey?: string;
  postKey?: unknown;
  postUrl?: unknown;
  retryShortcode?: boolean;
};

type InstagramShortcodeFetchOptions = {
  retry?: boolean;
};

type InstagramMediaCandidate = {
  url: string;
  extension: string;
  score: number;
};

type InstagramApiMeta = {
  shortcode?: string | null;
  id?: string | number | null;
  username?: string | null;
  sourceUrl?: string | null;
  title?: string | null;
  takenAt?: number | string | null;
};

type InstagramApiUrl = {
  url?: string | null;
  extension?: string | null;
};

type InstagramApiItem = {
  meta?: InstagramApiMeta | null;
  urls?: InstagramApiUrl[] | null;
  pictureUrl?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isInstagramApiItem(value: unknown): value is InstagramApiItem {
  return isRecord(value);
}

function getQuotaFromHeaders(headers: Headers): InstagramQuota {
  const remaining = headers.get('x-ratelimit-requests-remaining') || '0';
  const limit = headers.get('x-ratelimit-requests-limit') || '0';
  const resetSeconds = headers.get('x-ratelimit-requests-reset') || '0';

  return {
    limit: parseInt(limit, 10),
    remaining: parseInt(remaining, 10),
    resetSeconds: parseInt(resetSeconds, 10)
  };
}

function normalizeInstagramDataArray(data: unknown): InstagramApiItem[] {
  const rawItems = Array.isArray(data) ? data : (data ? [data] : []);
  return rawItems.filter(isInstagramApiItem);
}

function getUrlExtension(url: string): string {
  const withoutQuery = url.split('?')[0] || '';
  const match = withoutQuery.match(/\.([a-z0-9]+)$/i);
  return match?.[1]?.toLowerCase() || '';
}

function isVideoExtension(extension: string): boolean {
  return VIDEO_EXTENSIONS.includes(extension.toLowerCase());
}

function isVideoCandidate(url: string, extension: string): boolean {
  const lower = url.toLowerCase();
  return isVideoExtension(extension) || lower.includes('.mp4') || lower.includes('/video');
}

export function isLikelyInstagramVideoOnlyUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes('strext=1') ||
    lower.includes('video_dash') ||
    lower.includes('videodash') ||
    lower.includes('dashinit') ||
    lower.includes('dash_baseline') ||
    lower.includes('dash_') ||
    lower.includes('_dash')
  );
}

async function probeMediaHasAudio(url: string): Promise<boolean | null> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-user_agent', FFMPEG_USER_AGENT,
      '-rw_timeout', '15000000',
      '-show_entries', 'stream=codec_type',
      '-of', 'json',
      url,
    ], 20000);
    const parsed = JSON.parse(stdout) as { streams?: Array<{ codec_type?: string }> };
    return Boolean(parsed.streams?.some((stream) => stream.codec_type === 'audio'));
  } catch (error) {
    console.error('[Instagram] Failed to probe media audio stream:', getErrorMessage(error));
    return null;
  }
}

async function areSuspiciousInstagramMediaUrlsAudioSafe(mediaUrls: string[]): Promise<boolean> {
  const suspiciousUrls = mediaUrls.filter(isLikelyInstagramVideoOnlyUrl);
  if (!suspiciousUrls.length) return true;

  for (const url of suspiciousUrls) {
    const hasAudio = await probeMediaHasAudio(url);
    if (hasAudio !== true) return false;
  }

  return true;
}

export function getInstagramShortcodeFromIdentity(postKey: unknown, postUrl: unknown): string {
  const key = typeof postKey === 'string' ? postKey.trim() : '';
  if (key && !key.startsWith('takenAt_') && /^[A-Za-z0-9_-]+$/.test(key)) return key;

  const url = typeof postUrl === 'string' ? postUrl : '';
  const match = url.match(/instagram\.com\/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/i);
  return match?.[1] || '';
}

function scoreMediaCandidate(url: string, extension: string): number {
  let score = 0;
  const lower = url.toLowerCase();

  if (isVideoCandidate(url, extension)) score += 20;
  if (extension === 'mp4') score += 10;
  if (lower.includes('dl=1')) score += 2;
  if (isLikelyInstagramVideoOnlyUrl(url)) score -= 100;

  return score;
}

function getMediaCandidates(item: InstagramApiItem): InstagramMediaCandidate[] {
  const urls = Array.isArray(item?.urls) ? item.urls : [];

  return urls
    .map((entry: InstagramApiUrl) => {
      const url = typeof entry?.url === 'string' ? entry.url : '';
      if (!url) return null;
      const extension = String(entry?.extension || getUrlExtension(url)).toLowerCase();
      return {
        url,
        extension,
        score: scoreMediaCandidate(url, extension),
      };
    })
    .filter(Boolean) as InstagramMediaCandidate[];
}

function selectBestMediaUrl(item: InstagramApiItem): string {
  const candidates = getMediaCandidates(item);
  if (!candidates.length) return '';

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].url;
}

async function fetchMediaByShortcode(shortcode: string, rapidApiKey: string): Promise<{ data: unknown; quota: InstagramQuota }> {
  const res = await fetch(API_MEDIA_BY_SHORTCODE_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-rapidapi-host': RAPIDAPI_HOST,
      'x-rapidapi-key': rapidApiKey,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    body: JSON.stringify({ shortcode }),
  });

  if (!res.ok) {
    throw new Error(`RapidAPI Error: ${res.status} ${await res.text()}`);
  }

  return { data: await res.json(), quota: getQuotaFromHeaders(res.headers) };
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

    const data = normalizeInstagramDataArray(await res.json());
    if (!data.length) {
      throw new Error('Empty response from Instagram API');
    }

    // Find latest by takenAt
    const latestItem = data.reduce<InstagramApiItem | null>((best, item) => {
      const takenAt = Number(item?.meta?.takenAt || 0);
      if (!takenAt) return best;
      if (!best) return item;
      return takenAt > Number(best.meta?.takenAt || 0) ? item : best;
    }, null) || data[0];

    return {
      post: await processInstagramItem(latestItem, data, {
        rapidApiKey,
        allowShortcodeFallback: true,
      }),
      quota: getQuotaFromHeaders(res.headers),
    };
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

    const data = normalizeInstagramDataArray(await res.json());
    if (!data.length) {
      throw new Error('Empty response from Instagram API');
    }

    // The endpoint returns a flat array of media items. Group them by shortcode/id to form distinct posts.
    const postsMap = new Map<string, InstagramApiItem[]>();

    for (const item of data) {
      const sc = item?.meta?.shortcode || item?.meta?.id;
      if (!sc) continue;
      const key = String(sc);
      if (!postsMap.has(key)) postsMap.set(key, []);
      postsMap.get(key)!.push(item);
    }

    const recentPosts: InstagramPost[] = [];

    for (const [, items] of postsMap.entries()) {
      // We treat the first item in the group as the main metadata source
      const mainItem = items[0];
      if (mainItem) {
        recentPosts.push(buildInstagramPost(mainItem, data));
      }
    }

    // Sort them by takenAt descending (newest first)
    recentPosts.sort((a, b) => b.takenAt - a.takenAt);

    return { posts: recentPosts, quota: getQuotaFromHeaders(res.headers) };
  });
}

export async function getInstagramPostByShortcode(
  shortcode: string,
  rapidApiKey: string,
  options: InstagramShortcodeFetchOptions = {}
): Promise<{ post: InstagramPost, quota: InstagramQuota }> {
  const fetchOnce = async () => {
    const { data, quota } = await fetchMediaByShortcode(shortcode, rapidApiKey);
    const dataArray = normalizeInstagramDataArray(data);
    if (!dataArray.length) {
      throw new Error('Empty response from Instagram API');
    }

    return {
      post: await processInstagramItem(dataArray[0], dataArray, {
        rapidApiKey,
        allowShortcodeFallback: false,
      }),
      quota,
    };
  };

  if (options.retry === false) return fetchOnce();
  return withInstagramRetry('post by shortcode fetch', fetchOnce);
}

export async function resolveInstagramAudioSafeMediaUrls({
  mediaUrls,
  rapidApiKey,
  postKey,
  postUrl,
  retryShortcode = true,
}: ResolveAudioSafeMediaParams): Promise<string[]> {
  if (!mediaUrls.some(isLikelyInstagramVideoOnlyUrl)) return mediaUrls;

  if (await areSuspiciousInstagramMediaUrlsAudioSafe(mediaUrls)) {
    console.log('[Instagram] Suspicious media URL contains an audio stream; allowing publication.');
    return mediaUrls;
  }

  const shortcode = getInstagramShortcodeFromIdentity(postKey, postUrl);
  if (!rapidApiKey || !shortcode) {
    throw new Error('Instagram returned a video-only media file. Please fetch the post again or try later.');
  }

  const refreshed = await getInstagramPostByShortcode(shortcode, rapidApiKey, {
    retry: retryShortcode,
  });
  if (refreshed.post.mediaUrls.length && !refreshed.post.mediaUrls.some(isLikelyInstagramVideoOnlyUrl)) {
    console.log(`[Instagram] Replaced video-only media URL for ${shortcode} before publication.`);
    return refreshed.post.mediaUrls;
  }
  if (refreshed.post.mediaUrls.length && await areSuspiciousInstagramMediaUrlsAudioSafe(refreshed.post.mediaUrls)) {
    console.log(`[Instagram] Refreshed suspicious media URL for ${shortcode} contains an audio stream; allowing publication.`);
    return refreshed.post.mediaUrls;
  }

  throw new Error('Instagram returned a video-only media file. Please fetch the post again or try later.');
}

function buildInstagramPost(item: InstagramApiItem, allItems: InstagramApiItem[]): InstagramPost {
  const meta = item.meta || {};
  const shortcode = typeof meta.shortcode === 'string' ? meta.shortcode : ''; // might be empty if not found
  const username = typeof meta.username === 'string' ? meta.username : '';
  const postUrl = typeof meta.sourceUrl === 'string'
    ? meta.sourceUrl
    : (shortcode ? `https://www.instagram.com/p/${shortcode}/` : '');

  // Filter items matching this shortcode (if logical)
  // In `getLatest`, response contains many posts. valid logic:
  const samePostItems = shortcode
    ? allItems.filter(i => i.meta && i.meta.shortcode === shortcode)
    : [item];

  const mediaUrls = extractMediaUrls(samePostItems);
  const type = determinePostType(samePostItems);
  
  const imageUrl = item.pictureUrl || item.urls?.[0]?.url || '';
  const caption = typeof meta.title === 'string' ? meta.title : '';
  const takenAt = Number(meta.takenAt || 0);
  
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

async function processInstagramItem(
  item: InstagramApiItem,
  allItems: InstagramApiItem[],
  options: InstagramProcessOptions = {}
): Promise<InstagramPost> {
  const post = buildInstagramPost(item, allItems);
  const hasUnsafeVideoUrl = post.mediaUrls.some(isLikelyInstagramVideoOnlyUrl);

  if (!hasUnsafeVideoUrl) return post;

  if (post.shortcode && options.rapidApiKey && options.allowShortcodeFallback !== false) {
    try {
      const fallbackData = await fetchMediaByShortcode(post.shortcode, options.rapidApiKey);
      const fallbackArray = normalizeInstagramDataArray(fallbackData.data);
      if (!fallbackArray.length) {
        throw new Error('Empty shortcode fallback response');
      }

      const fallbackPost = buildInstagramPost(fallbackArray[0], fallbackArray);
      const fallbackHasUnsafeVideoUrl = fallbackPost.mediaUrls.some(isLikelyInstagramVideoOnlyUrl);
      if (fallbackPost.mediaUrls.length && !fallbackHasUnsafeVideoUrl) {
        console.log(`[Instagram] Replaced video-only media URL for ${post.shortcode} with shortcode media URL.`);
        return {
          ...post,
          mediaUrls: fallbackPost.mediaUrls,
          imageUrl: fallbackPost.imageUrl || post.imageUrl,
          type: fallbackPost.type || post.type,
        };
      }
    } catch (error) {
      console.error(`[Instagram] Failed to resolve audio-safe media for ${post.shortcode}:`, getErrorMessage(error));
    }
  }

  console.warn(`[Instagram] Video-only media URL remains for ${post.shortcode || post.postKey}; publication step will validate before upload.`);
  return post;
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

function extractMediaUrls(items: InstagramApiItem[]): string[] {
  return items
    .map((item) => {
      const selectedUrl = selectBestMediaUrl(item);
      return selectedUrl || null;
    })
    .filter((url): url is string => Boolean(url));
}

function determinePostType(items: InstagramApiItem[]): string {
  let videoCount = 0;
  let imageCount = 0;

  items.forEach(item => {
    const selectedUrl = selectBestMediaUrl(item);
    const ext = String(item.urls?.[0]?.extension || getUrlExtension(selectedUrl)).toLowerCase();
    if (isVideoExtension(ext) || selectedUrl.toLowerCase().includes('.mp4')) {
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
