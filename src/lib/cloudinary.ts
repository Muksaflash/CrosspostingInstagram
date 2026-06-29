import crypto from 'crypto';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

type DownloadedMedia = {
  filePath: string;
  type: 'video' | 'image';
  index: number;
};

type MediaDimensions = {
  width: number;
  height: number;
};

type CloudinaryResource = {
  public_id: string;
  created_at: string;
};

const MEDIA_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const IMAGE_SLIDE_DURATION_SECONDS = '3.5';
const SLIDESHOW_FPS = '30';

function sha1Hex(str: string): string {
  return crypto.createHash('sha1').update(str).digest('hex');
}

function cloudinarySignature(params: Record<string, string>, apiSecret: string): string {
  const keys = Object.keys(params).sort();
  const base = keys.map(k => `${k}=${params[k]}`).join('&');
  return sha1Hex(base + apiSecret);
}

function isVideoUrl(url: string): boolean {
  if (!url) return false;
  const u = url.toLowerCase().split('?')[0];
  return u.endsWith('.mp4') || u.endsWith('.mov') || u.endsWith('.avi') || u.endsWith('.webm');
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

function shellQuoteForConcatFile(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/'/g, "'\\''");
}

function toEvenDimension(value: number): number {
  const rounded = Math.max(2, Math.floor(value || 2));
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

function getDownloadedMediaType(url: string, contentType: string): 'video' | 'image' {
  if (contentType.toLowerCase().startsWith('video/')) return 'video';
  if (isVideoUrl(url)) return 'video';
  return 'image';
}

function getMediaExtension(type: 'video' | 'image', contentType: string): string {
  if (type === 'video') return '.mp4';
  const lower = contentType.toLowerCase();
  if (lower.includes('png')) return '.png';
  if (lower.includes('webp')) return '.webp';
  return '.jpg';
}

export async function uploadToCloudinary(
  blob: Blob,
  resourceType: 'video' | 'image',
  conf: CloudinaryConfig
) {
  const url = `https://api.cloudinary.com/v1_1/${conf.cloudName}/${resourceType}/upload`;
  const timestamp = String(Math.floor(Date.now() / 1000));

  const signature = cloudinarySignature({ timestamp }, conf.apiSecret);

  const formData = new FormData();
  let fileObj = blob;
  try {
    const defaultMime = resourceType === 'video' ? 'video/mp4' : 'image/jpeg';
    const ext = resourceType === 'video' ? '.mp4' : '.jpg';
    fileObj = new File([blob], `upload_file${ext}`, { type: blob.type || defaultMime });
  } catch { }

  formData.append('file', fileObj);
  formData.append('api_key', conf.apiKey);
  formData.append('timestamp', timestamp);
  formData.append('signature', signature);

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      body: formData,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`Cloudinary Upload Fetch Error: ${message}`);
  }

  const txt = await res.text();
  if (!res.ok) {
    throw new Error(`Cloudinary upload error (${res.status}): ${txt}`);
  }

  const data = JSON.parse(txt);
  if (!data.public_id) {
    throw new Error(`Cloudinary upload: no public_id in response: ${txt}`);
  }

  return {
    publicId: data.public_id,
    width: data.width,
    height: data.height,
    format: data.format,
    secureUrl: data.secure_url
  };
}

export async function getCloudinaryUsage(conf: CloudinaryConfig) {
  if (!conf.cloudName || !conf.apiKey || !conf.apiSecret) {
    throw new Error('Cloudinary credentials missing');
  }

  const url = `https://api.cloudinary.com/v1_1/${conf.cloudName}/usage`;
  const auth = Buffer.from(`${conf.apiKey}:${conf.apiSecret}`).toString('base64');

  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Authorization': `Basic ${auth}` }
  });

  if (!res.ok) {
    throw new Error(`Cloudinary usage error (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  return {
    plan: data.plan,
    credits_usage: data.credits?.usage || 0,
    credits_limit: data.credits?.limit || 0
  };
}

async function downloadMediaToTemp(url: string, dir: string, index: number): Promise<DownloadedMedia> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': MEDIA_USER_AGENT,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to download media ${index} (${res.status})`);
  }

  const contentType = res.headers.get('content-type') || '';
  const type = getDownloadedMediaType(url, contentType);
  const ext = getMediaExtension(type, contentType);
  const filePath = path.join(dir, `source_${String(index).padStart(3, '0')}${ext}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  return { filePath, type, index };
}

async function probeMediaDimensions(filePath: string): Promise<MediaDimensions> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'stream=width,height',
    '-of', 'json',
    filePath,
  ], 20000);
  const parsed = JSON.parse(stdout) as { streams?: Array<{ width?: number; height?: number }> };
  const stream = parsed.streams?.find((entry) => entry.width && entry.height);
  if (!stream?.width || !stream?.height) {
    throw new Error(`Could not detect media dimensions for ${path.basename(filePath)}`);
  }

  return {
    width: toEvenDimension(stream.width),
    height: toEvenDimension(stream.height),
  };
}

async function createSegment(media: DownloadedMedia, dir: string, dimensions: MediaDimensions): Promise<string> {
  const segmentPath = path.join(dir, `segment_${String(media.index).padStart(3, '0')}.mp4`);
  const videoFilter = [
    `scale=${dimensions.width}:${dimensions.height}:force_original_aspect_ratio=decrease`,
    `pad=${dimensions.width}:${dimensions.height}:(ow-iw)/2:(oh-ih)/2:black`,
    'setsar=1',
    'format=yuv420p',
  ].join(',');

  const inputArgs = media.type === 'image'
    ? ['-loop', '1', '-t', IMAGE_SLIDE_DURATION_SECONDS, '-i', media.filePath]
    : ['-i', media.filePath];

  await execFileAsync('ffmpeg', [
    '-y',
    ...inputArgs,
    '-vf', videoFilter,
    '-r', SLIDESHOW_FPS,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-an',
    segmentPath,
  ], 180000);

  return segmentPath;
}

async function concatenateSegments(segmentPaths: string[], dir: string): Promise<string> {
  const listPath = path.join(dir, 'segments.txt');
  const outputPath = path.join(dir, 'slideshow.mp4');
  const listContent = segmentPaths
    .map((segmentPath) => `file '${shellQuoteForConcatFile(segmentPath)}'`)
    .join('\n');
  await fs.writeFile(listPath, listContent);

  await execFileAsync('ffmpeg', [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', listPath,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-an',
    outputPath,
  ], 180000);

  return outputPath;
}

export async function createCloudinarySlideshowUrl(urls: string[], conf: CloudinaryConfig): Promise<string> {
  if (!conf.cloudName || !conf.apiKey || !conf.apiSecret) {
    throw new Error('Cloudinary credentials missing');
  }
  if (!urls || !urls.length) throw new Error('No URLs for slideshow');

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'crosspost-slideshow-'));

  try {
    const downloaded = (await Promise.all(
      urls.map((url, index) => url ? downloadMediaToTemp(url, tmpDir, index) : null)
    )).filter((media): media is DownloadedMedia => Boolean(media));

    if (!downloaded.length) throw new Error('No media downloaded');

    const baseMedia = downloaded.find((media) => media.type === 'video') || downloaded[0];
    const dimensions = await probeMediaDimensions(baseMedia.filePath);
    const segmentPaths = [];
    for (const media of downloaded.sort((a, b) => a.index - b.index)) {
      segmentPaths.push(await createSegment(media, tmpDir, dimensions));
    }

    const outputPath = await concatenateSegments(segmentPaths, tmpDir);
    const outputBuffer = await fs.readFile(outputPath);
    const uploadRes = await uploadToCloudinary(
      new Blob([outputBuffer], { type: 'video/mp4' }),
      'video',
      conf
    );

    return uploadRes.secureUrl || `https://res.cloudinary.com/${conf.cloudName}/video/upload/${uploadRes.publicId}.mp4`;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function cleanupOldCloudinaryAssets(conf: CloudinaryConfig, maxAgeHours: number): Promise<{ deletedImages: number, deletedVideos: number }> {
  if (!conf.cloudName || !conf.apiKey || !conf.apiSecret) {
    throw new Error('Cloudinary credentials missing');
  }

  const auth = Buffer.from(`${conf.apiKey}:${conf.apiSecret}`).toString('base64');
  const headers = {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/json'
  };

  let deletedImages = 0;
  let deletedVideos = 0;

  const deleteOldForType = async (resourceType: 'image' | 'video'): Promise<number> => {
    let deletedCount = 0;
    let nextCursor = null;

    do {
      // 1. Fetch resources
      let listUrl = `https://api.cloudinary.com/v1_1/${conf.cloudName}/resources/${resourceType}?max_results=500`;
      if (nextCursor) {
        listUrl += `&next_cursor=${nextCursor}`;
      }

      const listRes = await fetch(listUrl, { method: 'GET', headers });
      if (!listRes.ok) {
        const errText = await listRes.text();
        console.error(`Cloudinary list error (${listRes.status}): ${errText}`);
        break;
      }

      const listData = await listRes.json();
      const resources = (listData.resources || []) as CloudinaryResource[];
      nextCursor = listData.next_cursor;

      // 2. Filter old resources
      const now = Date.now();
      const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

      const oldPublicIds = resources
        .filter((r) => {
          const createdAt = new Date(r.created_at).getTime();
          const isOld = (now - createdAt) > maxAgeMs;
          return isOld;
        })
        .map((r) => r.public_id);

      // 3. Delete in batches (Admin API allows up to 100 per request)
      const batchSize = 100;
      for (let i = 0; i < oldPublicIds.length; i += batchSize) {
        const batch = oldPublicIds.slice(i, i + batchSize);
        // Note: Admin API delete endpoint uses form-data or JSON with "public_ids" array.
        // It's a bit tricky. For Admin API, the endpoint is DELETE /v1_1/:cloud_name/resources/image/upload
        // But let's use the explicit 'delete_resources' endpoint that accepts JSON.
        // DELETE /v1_1/:cloud_name/resources/image
        // Body: public_ids[]=id1&public_ids[]=id2

        // Actually, easiest way is to use destroy endpoint for single file or use delete_resources for multiple.
        // Let's use the bulk delete endpoint: DELETE /v1_1/:cloud_name/resources/:resource_type/upload

        // Build query string for public_ids[]=... (Cloudinary Admin API requires this over URL, not body for DELETE)
        const qs = batch.map((id: string) => `public_ids[]=${encodeURIComponent(id)}`).join('&');
        const deleteUrl = `https://api.cloudinary.com/v1_1/${conf.cloudName}/resources/${resourceType}/upload?${qs}`;

        const delRes = await fetch(deleteUrl, {
          method: 'DELETE',
          headers: {
            'Authorization': `Basic ${auth}`
          }
        });

        if (delRes.ok) {
          const delData = await delRes.json();
          // delData.deleted is an object like { "public_id1": "deleted", ... }
          const deletedMap = delData.deleted || {};
          const successfulDeletes = Object.values(deletedMap).filter(status => status === 'deleted').length;
          deletedCount += successfulDeletes;
        } else {
          console.error(`Cloudinary delete error: ${await delRes.text()}`);
        }
      }

    } while (nextCursor);

    return deletedCount;
  };

  deletedImages = await deleteOldForType('image');
  deletedVideos = await deleteOldForType('video');

  return { deletedImages, deletedVideos };
}
