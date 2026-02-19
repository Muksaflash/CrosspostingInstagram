
const BASE_URL = 'https://api.postmypost.io/v4.1';
const PROJECT_ID = 320499;

export function getPostMyPostToken() {
const token = process.env.POSTMYPOST_TOKEN;
if (!token) throw new Error("POSTMYPOST_TOKEN is not set");
return token;
}

export interface PostMyPostMedia {
url: string; // Direct URL to media
fileName?: string;
}

export async function uploadMediaToPostMyPost(media: PostMyPostMedia): Promise<string> {
const token = getPostMyPostToken();
const fileName = media.fileName || `media_${Date.now()}`;

// 0. Download from URL to Blob/Buffer
const fileRes = await fetch(media.url);
if (!fileRes.ok) throw new Error(`Failed to download media: ${media.url}`);
const blob = await fileRes.blob();
const size = blob.size;

// 1. Init Upload
const initRes = await fetch(`${BASE_URL}/upload/init`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    project_id: PROJECT_ID,
    name: fileName,
    size: size
  })
});

if (!initRes.ok) throw new Error(`PostMyPost Init Error: ${await initRes.text()}`);
const initData = await initRes.json();
const uploadId = initData.id;
const uploadUrl = initData.action;
const fields = initData.fields;

// 2. Upload to S3
const formData = new FormData();
if (fields) {
  Object.keys(fields).forEach(key => {
    formData.append(key, fields[key]);
  });
}
formData.append('file', blob, fileName);

const s3Res = await fetch(uploadUrl, {
  method: 'POST',
  body: formData
});

if (!s3Res.ok && s3Res.status !== 201 && s3Res.status !== 204) {
  throw new Error(`S3 Upload Error: ${s3Res.status} ${await s3Res.text()}`);
}

// 3. Complete Upload
const completeRes = await fetch(`${BASE_URL}/upload/complete?id=${encodeURIComponent(uploadId)}`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});

if (!completeRes.ok) throw new Error(`PostMyPost Complete Error: ${await completeRes.text()}`);

// 4. Wait for Status (Poll)
const maxAttempts = 15;
for (let i = 0; i < maxAttempts; i++) {
  await new Promise(r => setTimeout(r, 2000)); // Sleep 2s
  
  const statusRes = await fetch(`${BASE_URL}/upload/status?id=${encodeURIComponent(uploadId)}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (!statusRes.ok) continue;
  
  const statusData = await statusRes.json();
  // status: 1 (Completed), 2 (Error), 0 (Processing)
  if (statusData.status === 1 || statusData.status === 'COMPLETED') {
    return statusData.file_id || statusData.id || statusData.files?.[0]?.id;
  }
  
  if (statusData.status === 2 || statusData.status === 'ERROR') {
    throw new Error(`PostMyPost Processing Error: ${JSON.stringify(statusData)}`);
  }
}

throw new Error('PostMyPost Upload Timeout');
}

export async function createPublication(params: any): Promise<any> {
const token = getPostMyPostToken();
const res = await fetch(`${BASE_URL}/publications`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(params)
});

if (!res.ok) {
  throw new Error(`PostMyPost Publication Error: ${res.status} ${await res.text()}`);
}

return await res.json();
}
