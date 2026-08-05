import assert from 'node:assert/strict';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const srcUrl = (relativePath) => pathToFileURL(path.join(repoRoot, 'src', relativePath)).href;
const nextServerUrl = pathToFileURL(path.join(repoRoot, 'node_modules', 'next', 'server.js')).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      return {
        url: srcUrl(`${specifier.slice(2)}.ts`),
        shortCircuit: true,
      };
    }

    if (specifier === 'next/server') {
      return { url: nextServerUrl, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
});

const EMAIL = 'regression@example.com';
const CRON_SECRET = 'regression-secret';
const ENABLED_AT_MS = Date.UTC(2026, 5, 1, 12, 0, 0);
const PROFILE_ENDPOINT = 'https://instagram120.p.rapidapi.com/api/instagram/links';
const SHORTCODE_ENDPOINT = 'https://instagram120.p.rapidapi.com/api/instagram/mediaByShortcode';

function suspiciousReel(postKey, shortcode, takenAtMs) {
  return {
    meta: {
      id: postKey,
      shortcode,
      username: 'fixture.account',
      sourceUrl: `https://www.instagram.com/reel/${shortcode}/`,
      title: `Fixture ${shortcode}`,
      takenAt: Math.floor(takenAtMs / 1000),
    },
    urls: [{
      extension: 'mp4',
      url: `https://scontent.example/${shortcode}.mp4?strext=1`,
    }],
    pictureUrl: `https://scontent.example/${shortcode}.jpg`,
  };
}

function audioSafeShortcodeResponse(profileItem) {
  return [{
    ...profileItem,
    urls: [{
      extension: 'mp4',
      url: `https://scontent.example/${profileItem.meta.shortcode}.mp4?dl=1`,
    }],
  }];
}

function settingDoc(key, value) {
  return {
    id: key,
    data: () => ({ value }),
    ref: {
      parent: {
        parent: {
          id: EMAIL,
          parent: { id: 'users' },
        },
      },
    },
  };
}

function networkDoc(data) {
  return {
    id: data.id || 'network-1',
    data: () => data,
  };
}

function createScenario(overrides = {}) {
  return {
    profileItems: [],
    baselinePostKeys: [],
    trackedPostKeys: [],
    networks: [],
    shortcodeNotFound: false,
    shortcodeStatuses: [],
    calls: {
      profile: 0,
      shortcode: 0,
      ffprobe: 0,
      publications: 0,
      uploads: 0,
    },
    ...overrides,
  };
}

let scenario = createScenario();

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'x-ratelimit-requests-limit': '1000',
      'x-ratelimit-requests-remaining': '999',
      'x-ratelimit-requests-reset': '60',
    },
  });
}

async function mockedFetch(input, init = {}) {
  const url = String(input);

  if (url === PROFILE_ENDPOINT) {
    scenario.calls.profile++;
    return jsonResponse(scenario.profileItems);
  }

  if (url === SHORTCODE_ENDPOINT) {
    scenario.calls.shortcode++;
    if (scenario.shortcodeNotFound) {
      return new Response('link not found', { status: 404 });
    }
    const forcedStatus = scenario.shortcodeStatuses.shift();
    if (forcedStatus && forcedStatus !== 200) {
      return new Response(`temporary shortcode failure ${forcedStatus}`, { status: forcedStatus });
    }

    const body = JSON.parse(String(init.body || '{}'));
    const profileItem = scenario.profileItems.find((item) => item.meta.shortcode === body.shortcode);
    assert.ok(profileItem, `Unexpected shortcode request: ${body.shortcode}`);
    return jsonResponse(audioSafeShortcodeResponse(profileItem));
  }

  throw new Error(`Unexpected real network boundary: ${url}`);
}

function getSettingsDocs() {
  const settings = {
    AUTO_POST_ENABLED: 'true',
    AUTO_POST_WATERMARK_AT: String(ENABLED_AT_MS),
    INSTAGRAM_URL: 'https://www.instagram.com/fixture.account/',
    RAPIDAPI_KEY: 'mock-rapidapi-key',
    POSTMYPOST_TOKEN: 'mock-postmypost-token',
    POSTMYPOST_PROJECT_ID: '123',
    OPENAI_API_KEY: 'mock-openai-key',
  };

  return Object.entries(settings).map(([key, value]) => settingDoc(key, value));
}

function cacheDoc(docId) {
  return {
    async get() {
      if (docId !== 'autoPostBaseline') return { exists: false, data: () => undefined };
      return {
        exists: true,
        data: () => ({
          enabledAt: ENABLED_AT_MS,
          postKeys: scenario.baselinePostKeys,
        }),
      };
    },
    async set() {},
  };
}

function userRef() {
  return {
    collection(collectionName) {
      if (collectionName === 'cache') {
        return { doc: cacheDoc };
      }
      if (collectionName === 'socialNetworks') {
        return {
          async get() {
            return { docs: scenario.networks.map(networkDoc) };
          },
          doc() {
            return {};
          },
        };
      }
      throw new Error(`Unexpected Firestore user subcollection: ${collectionName}`);
    },
  };
}

const firestoreMock = {
  collection(collectionName) {
    assert.equal(collectionName, 'users');
    return {
      async get() {
        return {
          docs: [{ id: EMAIL, data: () => ({ email: EMAIL }) }],
        };
      },
      doc() {
        return userRef();
      },
    };
  },
  collectionGroup(collectionName) {
    assert.equal(collectionName, 'settings');
    return {
      async get() {
        return { docs: getSettingsDocs() };
      },
    };
  },
  batch() {
    return {
      update() {},
      async commit() {},
    };
  },
};

class MockNextResponse extends Response {
  static json(value, init = {}) {
    const headers = new Headers(init.headers);
    headers.set('content-type', 'application/json');
    return new MockNextResponse(JSON.stringify(value), { ...init, headers });
  }
}

mock.method(globalThis, 'fetch', mockedFetch);
mock.module('child_process', {
  namedExports: {
    execFile(_file, _args, _options, callback) {
      scenario.calls.ffprobe++;
      queueMicrotask(() => callback(new Error('mocked ffprobe: no audio stream'), '', ''));
      return { kill() {} };
    },
  },
});
mock.module(nextServerUrl, { namedExports: { NextResponse: MockNextResponse } });
mock.module(srcUrl('lib/firebase-admin.ts'), { namedExports: { firestore: firestoreMock } });
mock.module(srcUrl('lib/security.ts'), { namedExports: { safeCompare: (a, b) => a === b } });
mock.module(srcUrl('lib/openai.ts'), {
  namedExports: {
    adaptText: async (caption) => ({ title: 'Adapted title', text: caption }),
  },
});
mock.module(srcUrl('lib/postmypost.ts'), {
  namedExports: {
    getPostMyPostAccounts: async () => [{ id: 'account-1', channel_id: 'linkedin' }],
    uploadMediaUrlsToPostMyPost: async () => {
      scenario.calls.uploads++;
      return [101];
    },
    uploadFileToPostMyPost: async () => {
      throw new Error('Slideshow upload must not be reached by this fixture');
    },
    createPublication: async () => {
      scenario.calls.publications++;
      return { id: 'mock-publication' };
    },
  },
});
mock.module(srcUrl('lib/slideshow.ts'), {
  namedExports: {
    createSlideshowFile: async () => {
      throw new Error('Slideshow creation must not be reached by this fixture');
    },
  },
});
mock.module(srcUrl('lib/publishingText.ts'), {
  namedExports: {
    ensurePublicationTextLimits: async ({ title, content }) => ({
      title,
      content,
      shortened: false,
      platform: 'linkedin',
      platformLabel: 'LinkedIn',
    }),
  },
});
mock.module(srcUrl('app/actions.ts'), {
  namedExports: {
    getAutoPostedTracker: async () => scenario.trackedPostKeys,
    addPostToTracker: async () => {},
  },
});

process.env.CRON_SECRET = CRON_SECRET;

const instagram = await import(`${srcUrl('lib/instagram.ts')}?rapidapi-regression`);
const { GET: runAutoPostCron } = await import(`${srcUrl('app/api/cron/autopost/route.ts')}?rapidapi-regression`);

function cronRequest() {
  return new Request(`http://localhost/api/cron/autopost?secret=${CRON_SECRET}`);
}

function activeLinkedInNetwork() {
  return {
    id: 'linkedin-network',
    name: 'LinkedIn',
    platform: 'linkedin',
    accountId: 'account-1',
    enabled: true,
    prompt: 'Adapt for LinkedIn',
    publishingSettings: {
      contentFilter: ['single_video'],
      slideshowMode: 'never',
      publicationType: 1,
    },
  };
}

function silenceExpectedFixtureLogs(testContext) {
  testContext.mock.method(console, 'log', () => {});
  testContext.mock.method(console, 'warn', () => {});
  testContext.mock.method(console, 'error', () => {});
}

describe('RapidAPI auto-post request budget regression', { concurrency: false }, () => {
  beforeEach(() => {
    scenario = createScenario();
  });

  afterEach(() => {
    assert.equal(scenario.calls.profile <= 1, true, 'The fixture must never make more than one profile request');
  });

  it('does not resolve suspicious shortcode media for two old baseline reels', async (testContext) => {
    silenceExpectedFixtureLogs(testContext);
    const oldOne = suspiciousReel('baseline-post-1', 'OLDREEL1', ENABLED_AT_MS - 60 * 60 * 1000);
    const oldTwo = suspiciousReel('baseline-post-2', 'OLDREEL2', ENABLED_AT_MS - 30 * 60 * 1000);
    scenario = createScenario({
      profileItems: [oldOne, oldTwo],
      baselinePostKeys: ['baseline-post-1', 'baseline-post-2'],
    });

    const response = await runAutoPostCron(cronRequest());

    assert.equal(response.status, 200);
    assert.equal(scenario.calls.profile, 1, 'Cron should perform exactly one profile request');
    assert.equal(
      scenario.calls.shortcode,
      0,
      'Baseline posts must be filtered before any mediaByShortcode fallback',
    );
    assert.equal(scenario.calls.publications, 0);
  });

  it('allows only the new eligible reel to perform a shortcode fallback', async (testContext) => {
    silenceExpectedFixtureLogs(testContext);
    const oldOne = suspiciousReel('baseline-post-1', 'OLDREEL1', ENABLED_AT_MS - 60 * 60 * 1000);
    const oldTwo = suspiciousReel('baseline-post-2', 'OLDREEL2', ENABLED_AT_MS - 30 * 60 * 1000);
    const newPost = suspiciousReel('eligible-post', 'NEWREEL1', ENABLED_AT_MS + 60 * 1000);
    scenario = createScenario({
      profileItems: [newPost, oldTwo, oldOne],
      baselinePostKeys: ['baseline-post-1', 'baseline-post-2'],
      networks: [activeLinkedInNetwork()],
    });

    const response = await runAutoPostCron(cronRequest());

    assert.equal(response.status, 200);
    assert.equal(scenario.calls.profile, 1, 'Cron should perform exactly one profile request');
    assert.equal(
      scenario.calls.shortcode,
      1,
      'Only the eligible post may consume one mediaByShortcode request',
    );
    assert.equal(scenario.calls.publications, 1, 'The eligible post should continue through publication');
  });

  it('does not resolve suspicious shortcode media for an already tracked reel', async (testContext) => {
    silenceExpectedFixtureLogs(testContext);
    const trackedPost = suspiciousReel('tracked-post', 'TRACKED1', ENABLED_AT_MS + 60 * 1000);
    scenario = createScenario({
      profileItems: [trackedPost],
      trackedPostKeys: ['tracked-post'],
    });

    const response = await runAutoPostCron(cronRequest());

    assert.equal(response.status, 200);
    assert.equal(scenario.calls.profile, 1);
    assert.equal(
      scenario.calls.shortcode,
      0,
      'Tracked posts must be filtered before any mediaByShortcode fallback',
    );
    assert.equal(scenario.calls.publications, 0);
  });

  it('does not retry a deterministic mediaByShortcode link not found response', async (testContext) => {
    silenceExpectedFixtureLogs(testContext);
    scenario = createScenario({ shortcodeNotFound: true });
    testContext.mock.method(globalThis, 'setTimeout', (callback, _delay, ...args) => {
      queueMicrotask(() => callback(...args));
      return 0;
    });

    await assert.rejects(
      instagram.getInstagramPostByShortcode('MISSING1', 'mock-rapidapi-key'),
      /link not found/i,
    );

    assert.equal(
      scenario.calls.shortcode,
      1,
      'A deterministic link not found response must not consume all three retry attempts',
    );
  });

  it('retries a transient manual mediaByShortcode 500 and returns the next successful result', async (testContext) => {
    silenceExpectedFixtureLogs(testContext);
    const manualPost = suspiciousReel('manual-post', 'MANUAL500', ENABLED_AT_MS + 60 * 1000);
    scenario = createScenario({
      profileItems: [manualPost],
      shortcodeStatuses: [500],
    });
    testContext.mock.method(globalThis, 'setTimeout', (callback, _delay, ...args) => {
      queueMicrotask(() => callback(...args));
      return 0;
    });

    const result = await instagram.getInstagramPostByShortcode('MANUAL500', 'mock-rapidapi-key');

    assert.equal(scenario.calls.shortcode, 2, 'A transient 500 should be retried exactly once before success');
    assert.equal(result.post.shortcode, 'MANUAL500');
    assert.deepEqual(result.post.mediaUrls, ['https://scontent.example/MANUAL500.mp4?dl=1']);
  });
});
