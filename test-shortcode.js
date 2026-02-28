// Test mediaByShortcode endpoint to see if it returns different video URLs
const https = require('https');
const fs = require('fs');

// Get RapidAPI key from .env.local
const envContent = fs.readFileSync('.env.local', 'utf-8');
const rapidApiKeyMatch = envContent.match(/RAPIDAPI_KEY=(.+)/);
const RAPIDAPI_KEY = rapidApiKeyMatch ? rapidApiKeyMatch[1].trim() : '';

if (!RAPIDAPI_KEY) {
  console.error('No RAPIDAPI_KEY found in .env.local');
  process.exit(1);
}

const shortcode = 'DVK_dlvCKrS'; // from the debug log

const postData = JSON.stringify({ shortcode });
const options = {
  method: 'POST',
  hostname: 'instagram120.p.rapidapi.com',
  port: null,
  path: '/api/instagram/mediaByShortcode',
  headers: {
    'x-rapidapi-key': RAPIDAPI_KEY,
    'x-rapidapi-host': 'instagram120.p.rapidapi.com',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = https.request(options, function (res) {
  const chunks = [];
  res.on('data', chunk => chunks.push(chunk));
  res.on('end', () => {
    const body = Buffer.concat(chunks).toString();
    const data = JSON.parse(body);
    
    fs.writeFileSync('shortcode-debug.log', JSON.stringify(data, null, 2), 'utf-8');
    console.log('Response saved to shortcode-debug.log');
    
    // Check URLs
    const items = Array.isArray(data) ? data : [data];
    items.forEach((item, idx) => {
      if (item.urls) {
        console.log(`\nItem ${idx}: ${item.urls.length} URLs`);
        item.urls.forEach((u, i) => {
          const url = u.url || '';
          console.log(`  [${i}] ext=${u.extension}`);
          console.log(`       strext=${url.includes('strext=1')}, dst-mp4=${url.includes('dst-mp4')}`);
          console.log(`       url=${url.substring(0, 120)}...`);
        });
      }
    });
  });
});

req.on('error', e => console.error(e));
req.write(postData);
req.end();
