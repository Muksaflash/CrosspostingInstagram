import { promises as fs } from 'fs';
import path from 'path';

const BASE_URL = 'https://api.postmypost.io/v4.1';
const UPLOAD_RETRY_DELAYS_MS = [1500, 3000, 6000];
const UPLOAD_BETWEEN_FILES_DELAY_MS = 500;

export interface PostMyPostMedia {
  url: string; // Direct URL to media
  fileName?: string;
}

export interface PostMyPostAccount {
  id: string | number;
  name?: string;
  chanel_id?: string | number;
  channel_id?: string | number;
  connection_status?: string | number;
}

type UploadFieldValue = string | number | boolean | null | undefined;
type UploadField = { key: string; value: UploadFieldValue };
type UploadFields = UploadField[] | Record<string, UploadFieldValue>;

type UploadInitResponse = {
  id: string | number;
  action: string;
  fields?: UploadFields;
};

type UploadStatusResponse = {
  status?: string | number;
  file_id?: string | number;
  id?: string | number;
  files?: Array<{ id?: string | number }>;
};

type UploadBlobInput = {
  blob: Blob;
  fileName: string;
  mimeType: string;
  sourceLabel: string;
};

export type PostMyPostFileId = number;

type PublicationPayload = Record<string, unknown>;
type PublicationResponse = Record<string, unknown> & {
  id?: string | number;
  data?: {
    id?: string | number;
  };
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function textOrEmpty(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function inferMimeType(fileName: string, blobType?: string): string {
  if (blobType && blobType !== 'application/octet-stream') return blobType;

  const lower = fileName.toLowerCase();
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function normalizeFileId(fileId: string | number): PostMyPostFileId {
  const numericId = typeof fileId === 'number' ? fileId : Number(fileId);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    throw new Error(`PostMyPost Processing Error: invalid file id ${String(fileId)}`);
  }
  return numericId;
}

function appendUploadFields(formData: FormData, fields?: UploadFields) {
  if (!fields) return;

  if (Array.isArray(fields)) {
    // PostMyPost returns fields as array of {key, value}; S3 expects "key" first.
    const keyField = fields.find((field) => field.key === 'key');
    if (keyField?.value !== undefined && keyField.value !== null) {
      formData.append('key', String(keyField.value));
    }

    for (const field of fields) {
      if (field.key !== 'key' && field.value !== undefined && field.value !== null) {
        formData.append(String(field.key), String(field.value));
      }
    }
    return;
  }

  if (fields.key !== undefined && fields.key !== null) {
    formData.append('key', String(fields.key));
  }

  for (const [key, value] of Object.entries(fields)) {
    if (key !== 'key' && value !== undefined && value !== null) {
      formData.append(key, String(value));
    }
  }
}

async function initUpload(input: UploadBlobInput, token: string, projectId: number): Promise<UploadInitResponse> {
  let initRes: Response | null = null;
  let initErrorText = '';

  for (let attempt = 0; attempt <= UPLOAD_RETRY_DELAYS_MS.length; attempt++) {
    try {
      initRes = await fetch(`${BASE_URL}/upload/init`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: projectId,
          name: input.fileName,
          size: input.blob.size,
        }),
      });
    } catch (error: unknown) {
      if (attempt === UPLOAD_RETRY_DELAYS_MS.length) {
        throw new Error(`PostMyPost Init Fetch Error: ${errorMessage(error)}`);
      }
      await sleep(UPLOAD_RETRY_DELAYS_MS[attempt]);
      continue;
    }

    if (initRes.ok) break;

    initErrorText = await textOrEmpty(initRes);
    if (initRes.status !== 429 || attempt === UPLOAD_RETRY_DELAYS_MS.length) {
      throw new Error(`PostMyPost Init Error: ${initErrorText}`);
    }

    console.warn(`[PMP Upload] Init rate limited for ${input.fileName}, retrying in ${UPLOAD_RETRY_DELAYS_MS[attempt]}ms`);
    await sleep(UPLOAD_RETRY_DELAYS_MS[attempt]);
  }

  if (!initRes || !initRes.ok) throw new Error(`PostMyPost Init Error: ${initErrorText}`);

  const initData = await initRes.json() as UploadInitResponse;
  if (!initData.id || !initData.action) {
    throw new Error(`PostMyPost Init Error: unexpected response ${JSON.stringify(initData)}`);
  }

  return initData;
}

async function uploadBlobToPostMyPost(input: UploadBlobInput, token: string, projectId: number): Promise<PostMyPostFileId> {
  console.log(
    `[PMP Upload] Init upload for ${input.fileName} (${input.blob.size} bytes) from ${input.sourceLabel.substring(0, 100)}`
  );

  const initData = await initUpload(input, token, projectId);
  const uploadId = initData.id;
  const uploadUrl = initData.action;

  console.log(`[PMP Upload] Init successful. Upload ID: ${uploadId}, URL: ${uploadUrl}`);

  const formData = new FormData();
  appendUploadFields(formData, initData.fields);
  formData.append('file', input.blob, input.fileName);

  let s3Res: Response;
  try {
    s3Res = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });
  } catch (error: unknown) {
    throw new Error(`S3 Upload Fetch Error (${uploadUrl}): ${errorMessage(error)}`);
  }

  if (!s3Res.ok && s3Res.status !== 201 && s3Res.status !== 204) {
    throw new Error(`S3 Upload Error: ${s3Res.status} ${await s3Res.text()}`);
  }

  console.log(`[PMP Upload] S3 complete. Completing PMP upload for ${uploadId}`);
  let completeRes: Response;
  try {
    completeRes = await fetch(`${BASE_URL}/upload/complete?id=${encodeURIComponent(uploadId)}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  } catch (error: unknown) {
    throw new Error(`PostMyPost Complete Fetch Error: ${errorMessage(error)}`);
  }

  if (!completeRes.ok) {
    throw new Error(`PostMyPost Complete Error: ${await completeRes.text()}`);
  }

  const maxAttempts = 15;
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(2000);

    const statusRes = await fetch(`${BASE_URL}/upload/status?id=${encodeURIComponent(uploadId)}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!statusRes.ok) continue;

    const statusData = await statusRes.json() as UploadStatusResponse;
    if (statusData.status === 1 || statusData.status === 'COMPLETED' || statusData.status === 'completed') {
      const fileId = statusData.file_id ?? statusData.id ?? statusData.files?.[0]?.id;
      if (!fileId) {
        throw new Error(`PostMyPost Processing Error: upload completed without file id ${JSON.stringify(statusData)}`);
      }
      return normalizeFileId(fileId);
    }

    if (statusData.status === 2 || statusData.status === 'ERROR' || statusData.status === 'error') {
      throw new Error(`PostMyPost Processing Error: ${JSON.stringify(statusData)}`);
    }
  }

  throw new Error('PostMyPost Upload Timeout');
}

export async function uploadMediaToPostMyPost(
  media: PostMyPostMedia,
  token: string,
  projectId: number
): Promise<PostMyPostFileId> {
  const fileName = media.fileName || `media_${Date.now()}`;

  console.log(`[PMP Upload] Downloading media from ${media.url.substring(0, 100)}...`);
  let fileRes: Response;
  try {
    fileRes = await fetch(media.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
  } catch (error: unknown) {
    throw new Error(`Failed to download media ${media.url}: ${errorMessage(error)}`);
  }

  if (!fileRes.ok) {
    throw new Error(`Failed to download media: ${media.url} (Status: ${fileRes.status})`);
  }

  const blob = await fileRes.blob();
  return uploadBlobToPostMyPost({
    blob,
    fileName,
    mimeType: inferMimeType(fileName, blob.type),
    sourceLabel: media.url,
  }, token, projectId);
}

export async function uploadFileToPostMyPost(
  filePath: string,
  token: string,
  projectId: number,
  fileName = path.basename(filePath)
): Promise<PostMyPostFileId> {
  const mimeType = inferMimeType(fileName);
  const buffer = await fs.readFile(filePath);
  const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });

  return uploadBlobToPostMyPost({
    blob,
    fileName,
    mimeType,
    sourceLabel: filePath,
  }, token, projectId);
}

export async function uploadMediaUrlsToPostMyPost(
  urls: string[],
  token: string,
  projectId: number
): Promise<PostMyPostFileId[]> {
  const ids: PostMyPostFileId[] = [];
  const validUrls = urls.filter(url => !!url);

  for (let index = 0; index < validUrls.length; index++) {
    const url = validUrls[index];
    const isVideo = url.toLowerCase().split('?')[0].match(/\.(mp4|mov|avi|webm)$/);
    const fileName = `media_${Date.now()}_${index}${isVideo ? '.mp4' : '.jpg'}`;
    ids.push(await uploadMediaToPostMyPost({ url, fileName }, token, projectId));

    if (index < validUrls.length - 1) {
      await sleep(UPLOAD_BETWEEN_FILES_DELAY_MS);
    }
  }

  return ids;
}

export async function getPostMyPostAccounts(token: string, projectId: number): Promise<PostMyPostAccount[]> {
  const res = await fetch(`${BASE_URL}/accounts?project_id=${encodeURIComponent(projectId)}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`PostMyPost Accounts Error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

export async function createPublication(params: PublicationPayload, token: string): Promise<PublicationResponse> {
  const res = await fetch(`${BASE_URL}/publications`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    throw new Error(`PostMyPost Publication Error: ${res.status} ${await res.text()}`);
  }

  return await res.json();
}
