// Test: POST URL vs PROFILE URL to RapidAPI - which gives audio?
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf-8');
const rapidApiKeyMatch = envContent.match(/RAPIDAPI_KEY=(.+)/);
const RAPIDAPI_KEY = rapidApiKeyMatch ? rapidApiKeyMatch[1].trim() : '';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function testUrl(label, inputUrl) {
  console.log(`\n=== ${label} ===`);
  console.log(`Input: ${inputUrl}`);
  
  const apiRes = await fetch('https://instagram120.p.rapidapi.com/api/instagram/links', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-rapidapi-host': 'instagram120.p.rapidapi.com',
      'x-rapidapi-key': RAPIDAPI_KEY,
      'User-Agent': UA,
    },
    body: JSON.stringify({ url: inputUrl }),
  });
  const data = await apiRes.json();
  const items = Array.isArray(data) ? data : [data];
  const videoItem = items.find(i => i?.urls?.[0]?.extension === 'mp4');
  if (!videoItem) {
    console.log('  No video item found');
    return;
  }
  
  const videoUrl = videoItem.urls[0].url;
  console.log(`  CDN domain: ${new URL(videoUrl).hostname}`);
  console.log(`  Has audio_dashinit in _nc_vs: ${videoUrl.includes('audio_dashinit')}`);
  
  // Download and check
  const dlRes = await fetch(videoUrl, { headers: { 'User-Agent': UA } });
  const buf = Buffer.from(await dlRes.arrayBuffer());
  const str = buf.toString('latin1');
  const hasAudio = str.includes('smhd') || str.includes('mp4a');
  console.log(`  Downloaded: ${buf.length} bytes, audio: ${hasAudio ? '✅ YES' : '❌ NO'}`);
}

async function main() {
  // Test 1: Profile URL (how web app calls it)
  await testUrl('PROFILE URL', 'https://www.instagram.com/gagua.ai');
  
  // Test 2: Post URL (what worked earlier)  
  await testUrl('POST URL', 'https://www.instagram.com/p/DVK_dlvCKrS/');
  
  // Test 3: Reel URL
  await testUrl('REEL URL', 'https://www.instagram.com/reel/DVK_dlvCKrS/');
}

main().catch(console.error);
