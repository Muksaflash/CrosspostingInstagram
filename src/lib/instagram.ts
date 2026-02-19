
const RAPIDAPI_HOST = 'instagram120.p.rapidapi.com';
const API_ENDPOINT = 'https://instagram120.p.rapidapi.com/api/instagram/links';
const API_MEDIA_BY_SHORTCODE_ENDPOINT = 'https://instagram120.p.rapidapi.com/api/instagram/mediaByShortcode';

function getRapidApiKey() {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new Error("RAPIDAPI_KEY is not set");
  return key;
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

export async function getLatestInstagramPost(usernameUrl: string): Promise<InstagramPost> {
  // jitter logic skipped for simplicity, unless needed
  const payload = { url: usernameUrl };

  const res = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-rapidapi-host': RAPIDAPI_HOST,
      'x-rapidapi-key': getRapidApiKey(),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`RapidAPI Error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Empty response from Instagram API');
  }

  // Find latest by takenAt
  const latestItem = data.reduce((best, item) => {
    if (!item?.meta?.takenAt) return best;
    if (!best) return item;
    return item.meta.takenAt > best.meta.takenAt ? item : best;
  }, null) || data[0];

  return processInstagramItem(latestItem, data);
}

export async function getInstagramPostByShortcode(shortcode: string): Promise<InstagramPost> {
  const payload = { shortcode };

  const res = await fetch(API_MEDIA_BY_SHORTCODE_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-rapidapi-host': RAPIDAPI_HOST,
      'x-rapidapi-key': getRapidApiKey(),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`RapidAPI Error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Empty response from Instagram API');
  }

  // API returns array of items for the post (e.g. carousel items)
  // For 'mediaByShortcode', data[0] is usually enough or iterate
  const firstItem = data[0];
  return processInstagramItem(firstItem, data);
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
                  (shortcode) || 
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

function extractMediaUrls(items: any[]): string[] {
  return items
    .map(item => item.urls?.[0]?.url)
    .filter(Boolean);
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
