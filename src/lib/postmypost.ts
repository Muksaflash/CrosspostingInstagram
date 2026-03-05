
const BASE_URL = 'https://api.postmypost.io/v4.1';

export interface PostMyPostMedia {
  url: string; // Direct URL to media
  fileName?: string;
}

export async function uploadMediaToPostMyPost(media: PostMyPostMedia, token: string, projectId: number): Promise<string> {
const fileName = media.fileName || `media_${Date.now()}`;

// 0. Download from URL to Blob/Buffer
  console.log(`[PMP Upload] Downloading media from ${media.url.substring(0, 100)}...`);
  let fileRes;
  try {
    fileRes = await fetch(media.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
  } catch (e: any) {
    throw new Error(`Failed to download media ${media.url}: ${e.message}`);
  }
  if (!fileRes.ok) throw new Error(`Failed to download media: ${media.url} (Status: ${fileRes.status})`);
const blob = await fileRes.blob();
const size = blob.size;

// 1. Init Upload
  console.log(`[PMP Upload] Init upload for ${fileName} (${size} bytes)`);
  let initRes;
  try {
    initRes = await fetch(`${BASE_URL}/upload/init`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        project_id: projectId,
        name: fileName,
        size: size
      })
    });
  } catch (e: any) {
    throw new Error(`PostMyPost Init Fetch Error: ${e.message}`);
  }

if (!initRes.ok) throw new Error(`PostMyPost Init Error: ${await initRes.text()}`);
const initData = await initRes.json();
const uploadId = initData.id;
const uploadUrl = initData.action;
const fields = initData.fields;

  console.log(`[PMP Upload] Init successful. Upload ID: ${uploadId}, URL: ${uploadUrl}`);

// 2. Upload to S3
const formData = new FormData();
  if (fields && Array.isArray(fields)) {
    // PostMyPost returns fields as array of {key, value} objects
    // AWS S3 requires 'key' to be the first field
    const keyField = fields.find((f: any) => f.key === 'key');
    if (keyField) {
      formData.append('key', String(keyField.value));
    }
    for (const field of fields) {
      if (field.key !== 'key') {
        formData.append(String(field.key), String(field.value));
      }
    }
  } else if (fields && typeof fields === 'object') {
    // Fallback: flat object format
    if (fields.key) {
      formData.append('key', String(fields.key));
    }
    Object.keys(fields).forEach(k => {
      if (k !== 'key') {
        formData.append(k, String(fields[k]));
      }
  });
}
  // Try converting to File type if available, otherwise fallback to blob
  let fileObj = blob;
  try {
    const isVideo = fileName.endsWith('.mp4');
    const mime = blob.type && blob.type !== 'application/octet-stream'
      ? blob.type
      : (isVideo ? 'video/mp4' : 'image/jpeg');

    fileObj = new File([blob], fileName, { type: mime });
  } catch (err) {
    // If File is not defined in this environment, it just uses the blob
  }
  formData.append('file', fileObj);

  let s3Res;
  try {
    s3Res = await fetch(uploadUrl, {
      method: 'POST',
      body: formData
    });
  } catch (e: any) {
    throw new Error(`S3 Upload Fetch Error (${uploadUrl}): ${e.message}`);
  }

if (!s3Res.ok && s3Res.status !== 201 && s3Res.status !== 204) {
  throw new Error(`S3 Upload Error: ${s3Res.status} ${await s3Res.text()}`);
}

// 3. Complete Upload
  console.log(`[PMP Upload] S3 complete. Completing PMP upload for ${uploadId}`);
  let completeRes;
  try {
    completeRes = await fetch(`${BASE_URL}/upload/complete?id=${encodeURIComponent(uploadId)}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
  } catch (e: any) {
    throw new Error(`PostMyPost Complete Fetch Error: ${e.message}`);
  }

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

export async function uploadMediaUrlsToPostMyPost(urls: string[], token: string, projectId: number): Promise<string[]> {
  const uploadPromises = urls
    .filter(url => !!url)
    .map((url, index) => {
      const isVideo = url.toLowerCase().split('?')[0].match(/\.(mp4|mov|avi|webm)$/);
      const fileName = `media_${Date.now()}_${index}${isVideo ? '.mp4' : '.jpg'}`;
      return uploadMediaToPostMyPost({ url, fileName }, token, projectId);
    });

  return await Promise.all(uploadPromises);
}

export async function createPublication(params: any, token: string): Promise<any> {
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
