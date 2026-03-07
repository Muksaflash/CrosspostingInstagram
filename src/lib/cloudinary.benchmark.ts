import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createCloudinarySlideshowUrl } from './cloudinary.ts';

const mockConf = {
  cloudName: 'test-cloud',
  apiKey: 'test-key',
  apiSecret: 'test-secret'
};

const mockUrls = [
  'https://example.com/image1.jpg',
  'https://example.com/image2.jpg',
  'https://example.com/video1.mp4'
];

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Mock global fetch
const originalFetch = global.fetch;

describe('Cloudinary Slideshow Benchmark', () => {
  it('should measure execution time of createCloudinarySlideshowUrl', async () => {
    // @ts-ignore
    global.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      await sleep(100); // Simulate 100ms latency

      if (urlStr.includes('upload')) {
        return new Response(JSON.stringify({
          public_id: 'mock_public_id_' + Math.random(),
          width: 1280,
          height: 720,
          format: 'mp4'
        }), { status: 200 });
      }

      if (urlStr.includes('res.cloudinary.com') && urlStr.includes('video/upload')) {
          // This matches both conversion and final URL check
          if (init?.method === 'GET' && init?.headers && 'Range' in (init.headers as any)) {
              // Polling check
              return new Response('', { status: 200 });
          }
          // Conversion check
          return new Response(new Blob(['mock video data']), { status: 200 });
      }

      // Default: download source
      return new Response(new Blob(['mock image data']), { status: 200 });
    };

    const start = Date.now();
    try {
        const resultUrl = await createCloudinarySlideshowUrl(mockUrls, mockConf);
        const end = Date.now();

        const duration = end - start;
        console.log(`\n--- BENCHMARK RESULT ---`);
        console.log(`Slideshow generation took ${duration}ms`);
        console.log(`------------------------\n`);

        assert.ok(resultUrl.startsWith('https://res.cloudinary.com/test-cloud/video/upload/'));
    } finally {
        global.fetch = originalFetch;
    }
  });
});
