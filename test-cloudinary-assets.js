const cloudName = 'dmue4mgal';
const apiKey = '793219884859617';
const apiSecret = 'LI-phOqhRrj0riI7LjVf9Oqm-MI';

async function test() {
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  const headers = {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/json'
  };

  const getAssets = async (type) => {
    const listUrl = `https://api.cloudinary.com/v1_1/${cloudName}/resources/${type}?max_results=500`;
    const res = await fetch(listUrl, { method: 'GET', headers });
    const data = await res.json();
    console.log(`Found ${data.resources ? data.resources.length : 0} ${type}s`);
    
    if (data.resources && data.resources.length > 0) {
      data.resources.slice(0, 5).forEach(r => {
        console.log(`  ID: ${r.public_id} | Created: ${r.created_at} | ${Date.now() - new Date(r.created_at).getTime()} ms ago`);
      });
    }
  };

  await getAssets('image');
  await getAssets('video');
}

test();
