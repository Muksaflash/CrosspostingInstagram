// Test RapidAPI with Google Apps Script User-Agent
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf-8');
const rapidApiKeyMatch = envContent.match(/RAPIDAPI_KEY=(.+)/);
const RAPIDAPI_KEY = rapidApiKeyMatch ? rapidApiKeyMatch[1].trim() : '';

const url = 'https://www.instagram.com/p/DVK_dlvCKrS/';
const API_ENDPOINT = 'https://instagram120.p.rapidapi.com/api/instagram/links';

async function test() {
  console.log('Fetching from RapidAPI with GAS User-Agent...');
  const res = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-rapidapi-host': 'instagram120.p.rapidapi.com',
      'x-rapidapi-key': RAPIDAPI_KEY,
      'User-Agent': 'Mozilla/5.0 (compatible; Google-Apps-Script)',
      // Maybe the Web App sends something else? 
    },
    body: JSON.stringify({ url }), // we send exactly what GAS sends
  });

  const data = await res.json();
  const item = Array.isArray(data) ? data[0] : data;
  
  if (item && item.urls) {
    console.log(`\nGot ${item.urls.length} variants:`);
    item.urls.forEach((u, i) => {
      console.log(`[${i}] ext=${u.extension}, url=${u.url.substring(0, 100)}...`);
      console.log(`  strext=${u.url.includes('strext=1')}`);
      console.log(`  dl=${u.url.includes('dl=1')}`);
      console.log(`  domain=${new URL(u.url).hostname}`);
    });
    
    // Test downloading the first URL
    const videoUrl = item.urls[0].url;
    console.log(`\nDownloading video to check audio: ${videoUrl.substring(0, 80)}...`);
    const vidRes = await fetch(videoUrl);
    const buf = Buffer.from(await vidRes.arrayBuffer());
    const str = buf.toString('latin1');
    const hasAudio = str.includes('smhd') || str.includes('mp4a');
    console.log(`Audio: ${hasAudio ? '✅ YES' : '❌ NO'}, Size: ${buf.length}`);
  } else {
    console.log('No URLs found', data);
  }
}

test().catch(console.error);
