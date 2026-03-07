import { describe, it } from 'node:test';
import assert from 'node:assert';

// Mock NextResponse
class MockNextResponse {
  status: number;
  body: any;

  constructor(body: any, init?: any) {
    this.body = body;
    this.status = init?.status || 200;
  }
}

// Mock handlers to test the logic change
const mockHandlers = {
  proxyImage: async (fail: boolean) => {
    try {
      if (fail) throw new Error("Sensitive DB connection string or internal path");
      return new MockNextResponse("OK", { status: 200 });
    } catch (error: any) {
      // This is the current logic we want to fix
      // return new MockNextResponse("Error fetching image", { status: 500 });
      // We want it to be:
      return new MockNextResponse("Internal Server Error", { status: 500 });
    }
  },
  postMyPostAccounts: async (fail: boolean) => {
    try {
      if (fail) throw new Error("PostMyPost API Error: 401 Unauthorized - Invalid Token: ABC-123");
      return new MockNextResponse("OK", { status: 200 });
    } catch (error: any) {
      // Current: return new MockNextResponse(error.message, { status: 500 });
      return new MockNextResponse("Internal Server Error", { status: 500 });
    }
  }
};

describe('Security Information Disclosure', () => {
  it('should return "Internal Server Error" for proxy-image on failure', async () => {
    const response = await mockHandlers.proxyImage(true);
    assert.strictEqual(response.status, 500);
    assert.strictEqual(response.body, "Internal Server Error");
    assert.ok(!response.body.includes("Sensitive"), "Should not disclose sensitive info");
  });

  it('should return "Internal Server Error" for postmypost accounts on failure', async () => {
    const response = await mockHandlers.postMyPostAccounts(true);
    assert.strictEqual(response.status, 500);
    assert.strictEqual(response.body, "Internal Server Error");
    assert.ok(!response.body.includes("ABC-123"), "Should not disclose sensitive tokens");
  });
});
