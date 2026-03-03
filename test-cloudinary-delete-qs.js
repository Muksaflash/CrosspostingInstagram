const cloudName = 'dmue4mgal';
const apiKey = '793219884859617';
const apiSecret = 'LI-phOqhRrj0riI7LjVf9Oqm-MI';

async function testDelete() {
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  
  const publicIds = ['IMG_8258_p24296'];
  const qs = publicIds.map(id => `public_ids[]=${encodeURIComponent(id)}`).join('&');
  
  const deleteUrl = `https://api.cloudinary.com/v1_1/${cloudName}/resources/image/upload?${qs}`;

  console.log('Sending DELETE to:', deleteUrl);
  
  const res = await fetch(deleteUrl, {
    method: 'DELETE',
    headers: {
      'Authorization': `Basic ${auth}`
    }
  });

  console.log('Status:', res.status);
  console.log('Response:', await res.text());
}

testDelete();
