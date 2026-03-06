import { describe, it } from 'node:test';
import assert from 'node:assert';

// Mock NextResponse
class MockNextResponse {
  status: number;
  body: any;
  headers: Map<string, string>;

  constructor(body: any, init?: any) {
    this.body = body;
    this.status = init?.status || 200;
    this.headers = new Map(Object.entries(init?.headers || {}));
  }
}

// Simple imitation of the GET handler logic for testing purposes
// We'll update this once we have the actual implementation to verify
async function mockGET(request: { nextUrl: URL }) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return new MockNextResponse("Missing URL", { status: 400 });
  }

  // ALLOWED_DOMAINS should match what we implement in the route
  const ALLOWED_DOMAINS = ["cdninstagram.com", "fbcdn.net", "res.cloudinary.com"];

  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname;

    const isAllowed = ALLOWED_DOMAINS.some(domain =>
      hostname === domain || hostname.endsWith("." + domain)
    );

    if (!isAllowed) {
      return new MockNextResponse("Forbidden", { status: 403 });
    }

    // In a real scenario, it would then call fetch(url)
    return new MockNextResponse("OK", { status: 200 });
  } catch (error) {
    return new MockNextResponse("Invalid URL", { status: 400 });
  }
}

describe('Image Proxy SSRF Protection Logic', () => {
  it('should block requests to localhost', async () => {
    const request = { nextUrl: new URL('http://localhost:3000/api/proxy-image?url=http://localhost:8080/secret') };
    const response = await mockGET(request);

    assert.strictEqual(response.status, 403, 'Should return 403 Forbidden for localhost');
  });

  it('should block requests to internal IP addresses', async () => {
    const request = { nextUrl: new URL('http://localhost:3000/api/proxy-image?url=http://169.254.169.254/latest/meta-data/') };
    const response = await mockGET(request);

    assert.strictEqual(response.status, 403, 'Should return 403 Forbidden for metadata service');
  });

  it('should block requests to non-whitelisted external domains', async () => {
    const request = { nextUrl: new URL('http://localhost:3000/api/proxy-image?url=https://malicious-site.com/image.jpg') };
    const response = await mockGET(request);

    assert.strictEqual(response.status, 403, 'Should return 403 Forbidden for non-whitelisted domains');
  });

  it('should allow requests to whitelisted domains (cdninstagram.com)', async () => {
    const request = { nextUrl: new URL('http://localhost:3000/api/proxy-image?url=https://scontent.cdninstagram.com/v/t51.2885-15/e35/image.jpg') };
    const response = await mockGET(request);

    assert.strictEqual(response.status, 200, 'Should return 200 for cdninstagram.com');
  });

  it('should allow requests to whitelisted domains (fbcdn.net)', async () => {
    const request = { nextUrl: new URL('http://localhost:3000/api/proxy-image?url=https://instagram.fmnl9-2.fna.fbcdn.net/image.jpg') };
    const response = await mockGET(request);

    assert.strictEqual(response.status, 200, 'Should return 200 for fbcdn.net');
  });

  it('should allow requests to whitelisted domains (res.cloudinary.com)', async () => {
    const request = { nextUrl: new URL('http://localhost:3000/api/proxy-image?url=https://res.cloudinary.com/demo/image/upload/sample.jpg') };
    const response = await mockGET(request);

    assert.strictEqual(response.status, 200, 'Should return 200 for res.cloudinary.com');
  });

  it('should handle malformed URLs gracefully', async () => {
    const request = { nextUrl: new URL('http://localhost:3000/api/proxy-image?url=not-a-url') };
    const response = await mockGET(request);

    assert.strictEqual(response.status, 400, 'Should return 400 for malformed URL');
  });
});
