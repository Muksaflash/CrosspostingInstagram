const crypto = require('crypto');

const cloudName = 'dmue4mgal';
const apiKey = '793219884859617';
const apiSecret = 'LI-phOqhRrj0riI7LjVf9Oqm-MI';

function sha1Hex(str) {
  return crypto.createHash('sha1').update(str).digest('hex');
}

function cloudinarySignature(params, secret) {
  const keys = Object.keys(params).sort();
  const base = keys.map(k => `${k}=${params[k]}`).join('&');
  return sha1Hex(base + secret);
}

async function testDestroy() {
  const publicId = 'IMG_8258_p24296';
  const timestamp = Math.floor(Date.now() / 1000).toString();
  
  const signature = cloudinarySignature({
    public_id: publicId,
    timestamp: timestamp
  }, apiSecret);

  const deleteUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`;
  
  const formData = new URLSearchParams();
  formData.append('public_id', publicId);
  formData.append('api_key', apiKey);
  formData.append('timestamp', timestamp);
  formData.append('signature', signature);

  console.log('Sending destroy req to:', deleteUrl);
  
  const res = await fetch(deleteUrl, {
    method: 'POST',
    body: formData
  });

  console.log('Status:', res.status);
  console.log('Response:', await res.json());
}

testDestroy();
