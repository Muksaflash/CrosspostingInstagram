import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

type DownloadedMedia = {
  filePath: string;
  type: 'video' | 'image';
  index: number;
};

type MediaInfo = {
  width: number;
  height: number;
  duration: number;
  hasAudio: boolean;
};

export type SlideshowFile = {
  filePath: string;
  fileName: string;
  cleanup: () => Promise<void>;
};

const MEDIA_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const IMAGE_SLIDE_DURATION_SECONDS = 3.5;
const SLIDESHOW_FPS = '30';
const AUDIO_SOURCE = 'anullsrc=channel_layout=stereo:sample_rate=44100';

function execFileAsync(file: string, args: string[], timeout: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function isVideoUrl(url: string): boolean {
  const lower = url.toLowerCase().split('?')[0] || '';
  return /\.(mp4|mov|avi|webm)$/i.test(lower);
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

function toEvenDimension(value: number): number {
  const rounded = Math.max(2, Math.floor(value || 2));
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

function normalizeConcatPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/'/g, "'\\''");
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
  await fs.writeFile(filePath, Buffer.from(await res.arrayBuffer()));

  return { filePath, type, index };
}

async function probeMediaInfo(filePath: string): Promise<MediaInfo> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'stream=width,height,codec_type:format=duration',
    '-of', 'json',
    filePath,
  ], 20000);

  const parsed = JSON.parse(stdout) as {
    streams?: Array<{ width?: number; height?: number; codec_type?: string }>;
    format?: { duration?: string };
  };
  const videoStream = parsed.streams?.find((stream) => stream.width && stream.height);
  if (!videoStream?.width || !videoStream?.height) {
    throw new Error(`Could not detect media dimensions for ${path.basename(filePath)}`);
  }

  return {
    width: toEvenDimension(videoStream.width),
    height: toEvenDimension(videoStream.height),
    duration: Math.max(0.1, Number(parsed.format?.duration || 0)),
    hasAudio: Boolean(parsed.streams?.some((stream) => stream.codec_type === 'audio')),
  };
}

function buildVideoFilter(dimensions: Pick<MediaInfo, 'width' | 'height'>): string {
  return [
    `scale=${dimensions.width}:${dimensions.height}:force_original_aspect_ratio=decrease`,
    `pad=${dimensions.width}:${dimensions.height}:(ow-iw)/2:(oh-ih)/2:black`,
    'setsar=1',
    'format=yuv420p',
  ].join(',');
}

async function createImageSegment(media: DownloadedMedia, dir: string, dimensions: Pick<MediaInfo, 'width' | 'height'>): Promise<string> {
  const segmentPath = path.join(dir, `segment_${String(media.index).padStart(3, '0')}.mp4`);

  await execFileAsync('ffmpeg', [
    '-y',
    '-loop', '1',
    '-t', String(IMAGE_SLIDE_DURATION_SECONDS),
    '-i', media.filePath,
    '-f', 'lavfi',
    '-t', String(IMAGE_SLIDE_DURATION_SECONDS),
    '-i', AUDIO_SOURCE,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-vf', buildVideoFilter(dimensions),
    '-r', SLIDESHOW_FPS,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-ac', '2',
    '-shortest',
    segmentPath,
  ], 180000);

  return segmentPath;
}

async function createVideoSegment(media: DownloadedMedia, dir: string, dimensions: Pick<MediaInfo, 'width' | 'height'>): Promise<string> {
  const segmentPath = path.join(dir, `segment_${String(media.index).padStart(3, '0')}.mp4`);
  const info = await probeMediaInfo(media.filePath);
  const args = [
    '-y',
    '-i', media.filePath,
  ];

  if (!info.hasAudio) {
    args.push('-f', 'lavfi', '-t', String(info.duration), '-i', AUDIO_SOURCE);
  }

  args.push(
    '-map', '0:v:0',
    '-map', info.hasAudio ? '0:a:0' : '1:a:0',
    '-vf', buildVideoFilter(dimensions),
    '-r', SLIDESHOW_FPS,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-ac', '2',
    '-shortest',
    segmentPath
  );

  await execFileAsync('ffmpeg', args, 240000);
  return segmentPath;
}

async function createSegment(media: DownloadedMedia, dir: string, dimensions: Pick<MediaInfo, 'width' | 'height'>): Promise<string> {
  if (media.type === 'image') {
    return createImageSegment(media, dir, dimensions);
  }
  return createVideoSegment(media, dir, dimensions);
}

async function concatenateSegments(segmentPaths: string[], dir: string): Promise<string> {
  const listPath = path.join(dir, 'segments.txt');
  const outputPath = path.join(dir, 'slideshow.mp4');
  const listContent = segmentPaths
    .map((segmentPath) => `file '${normalizeConcatPath(segmentPath)}'`)
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
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-ac', '2',
    '-movflags', '+faststart',
    outputPath,
  ], 240000);

  return outputPath;
}

export async function createSlideshowFile(urls: string[]): Promise<SlideshowFile> {
  if (!urls || !urls.length) throw new Error('No URLs for slideshow');

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'crosspost-slideshow-'));

  try {
    const downloaded = (await Promise.all(
      urls.map((url, index) => url ? downloadMediaToTemp(url, tmpDir, index) : null)
    )).filter((media): media is DownloadedMedia => Boolean(media));

    if (!downloaded.length) throw new Error('No media downloaded');

    const baseMedia = downloaded.find((media) => media.type === 'video') || downloaded[0];
    const dimensions = await probeMediaInfo(baseMedia.filePath);
    const segmentPaths: string[] = [];
    for (const media of downloaded.sort((a, b) => a.index - b.index)) {
      segmentPaths.push(await createSegment(media, tmpDir, dimensions));
    }

    const filePath = await concatenateSegments(segmentPaths, tmpDir);
    return {
      filePath,
      fileName: `slideshow_${Date.now()}.mp4`,
      cleanup: () => fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined),
    };
  } catch (error) {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}
