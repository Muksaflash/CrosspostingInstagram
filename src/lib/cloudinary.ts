import crypto from 'crypto';

interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

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
  } catch (err) { }
  
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
  } catch (e: any) {
    throw new Error(`Cloudinary Upload Fetch Error: ${e.message}`);
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
    format: data.format
  };
}

async function cloudinaryPingDelivery(url: string): Promise<number> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' }
    });
    return res.status;
  } catch (e) {
    return 500;
  }
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

export async function createCloudinarySlideshowUrl(urls: string[], conf: CloudinaryConfig): Promise<string> {
  if (!conf.cloudName || !conf.apiKey || !conf.apiSecret) {
    throw new Error('Cloudinary credentials missing');
  }
  if (!urls || !urls.length) throw new Error('No URLs for slideshow');

  // 1) Download and upload all sources
  const rawAssets = [];
  for (let i = 0; i < urls.length; i++) {
    const u = urls[i];
    if (!u) continue;
    const isVid = isVideoUrl(u);
    
    const dRes = await fetch(u);
    if (!dRes.ok) throw new Error(`Failed to download media ${u}`);
    const blob = await dRes.blob();
    
    const upRes = await uploadToCloudinary(blob, isVid ? 'video' : 'image', conf);
    rawAssets.push({
      type: isVid ? 'video' : 'image',
      publicId: upRes.publicId,
      width: upRes.width,
      height: upRes.height,
      index: i
    });
  }

  if (!rawAssets.length) throw new Error('No media uploaded');

  const baseVideo = rawAssets.find(a => a.type === 'video') || rawAssets[0];
  const TARGET_W = baseVideo.width;
  const TARGET_H = baseVideo.height;
  const donorVideoId = baseVideo.type === 'video' ? baseVideo.publicId : 'sample';

  // 2) Convert IMAGE to VIDEO segments
  const videoAssets = [];
  for (const asset of rawAssets) {
    if (asset.type === 'video') {
      videoAssets.push(asset);
    } else {
      const transformations = [
        `w_${TARGET_W},h_${TARGET_H},c_pad,b_black`, // slide back
        'du_3.5',
        'ac_none',
        // overlay Image
        `l_${asset.publicId.replace(/\//g, ':')},w_${TARGET_W},h_${TARGET_H},c_pad,b_black,fl_layer_apply,so_0`
      ];

      const convertUrl = `https://res.cloudinary.com/${conf.cloudName}/video/upload/${transformations.join('/')}/${donorVideoId}.mp4`;
      
      const vRes = await fetch(convertUrl);
      if (!vRes.ok) throw new Error(`Convert fail ${vRes.status}`);
      const vBlob = await vRes.blob();
      
      const vUpRes = await uploadToCloudinary(vBlob, 'video', conf);
      videoAssets.push({
        type: 'video',
        publicId: vUpRes.publicId,
        width: TARGET_W,
        height: TARGET_H,
        index: asset.index
      });
    }
  }

  // 3) Splice together
  const baseAsset = videoAssets[0];
  const appendAssets = videoAssets.slice(1);

  const transformations = [];
  transformations.push(`w_${TARGET_W},h_${TARGET_H},c_pad,b_black`);

  for (const seg of appendAssets) {
    if (seg.type === 'video') {
      const safe = seg.publicId.replace(/\//g, ':');
      const layerTrans = `w_${TARGET_W},h_${TARGET_H},c_pad,b_black`;
      transformations.push(`fl_splice,l_video:${safe}`);
      transformations.push(layerTrans);
      transformations.push('fl_layer_apply');
    }
  }

  const finalUrl = `https://res.cloudinary.com/${conf.cloudName}/video/upload/${transformations.join('/')}/${baseAsset.publicId}.mp4`;

  // 4) Poll for readiness
  const deadline = Date.now() + 120 * 1000;
  while (Date.now() < deadline) {
    const code = await cloudinaryPingDelivery(finalUrl);
    if (code === 200 || code === 206) {
      return finalUrl;
    }
    if (code === 400) throw new Error('Final splice 400 error');
    await new Promise(r => setTimeout(r, 5000));
  }

  throw new Error('Timeout waiting for slideshow');
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

      console.log(`Cloudinary: Fetching ${resourceType}s from ${listUrl}`);
      const listRes = await fetch(listUrl, { method: 'GET', headers });
      if (!listRes.ok) {
        const errText = await listRes.text();
        console.error(`Cloudinary list error (${listRes.status}): ${errText}`);
        break;
      }

      const listData = await listRes.json();
      const resources = listData.resources || [];
      nextCursor = listData.next_cursor;
      console.log(`Cloudinary: Found ${resources.length} ${resourceType}(s)`);

      // 2. Filter old resources
      const now = Date.now();
      const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

      const oldPublicIds = resources
        .filter((r: any) => {
          const createdAt = new Date(r.created_at).getTime();
          const isOld = (now - createdAt) > maxAgeMs;
          console.log(`  Resource ${r.public_id}: created=${r.created_at}, age=${Math.round((now - createdAt) / 3600000)}h, old=${isOld}`);
          return isOld;
        })
        .map((r: any) => r.public_id);
      console.log(`Cloudinary: ${oldPublicIds.length} ${resourceType}(s) older than ${maxAgeHours}h to delete`);

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
