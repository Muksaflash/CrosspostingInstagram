// End-to-end test: RapidAPI → get URL → download with User-Agent → check audio
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf-8');
const rapidApiKeyMatch = envContent.match(/RAPIDAPI_KEY=(.+)/);
const RAPIDAPI_KEY = rapidApiKeyMatch ? rapidApiKeyMatch[1].trim() : '';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function checkAudio(label, buffer) {
  const str = buffer.toString('latin1');
  const hasSmhd = str.includes('smhd');
  const hasMp4a = str.includes('mp4a');
  console.log(`  ${label}: size=${buffer.length}, audio=${hasSmhd || hasMp4a ? '✅ YES' : '❌ NO'} (smhd=${hasSmhd}, mp4a=${hasMp4a})`);
  return hasSmhd || hasMp4a;
}

async function test() {
  const url = 'https://www.instagram.com/gagua.ai';
  
  // Step 1: Call RapidAPI WITH User-Agent (like the fix)
  console.log('=== Step 1: RapidAPI with User-Agent ===');
  const apiRes = await fetch('https://instagram120.p.rapidapi.com/api/instagram/links', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-rapidapi-host': 'instagram120.p.rapidapi.com',
      'x-rapidapi-key': RAPIDAPI_KEY,
      'User-Agent': UA,
    },
    body: JSON.stringify({ url }),
  });
  const data = await apiRes.json();
  const item = Array.isArray(data) ? data[0] : data;
  const videoUrl = item?.urls?.[0]?.url;
  
  if (!videoUrl) {
    console.log('No video URL found!', JSON.stringify(data).substring(0, 200));
    return;
  }
  
  console.log(`  Video URL domain: ${new URL(videoUrl).hostname}`);
  console.log(`  strext=1: ${videoUrl.includes('strext=1')}`);
  
  // Step 2: Download WITH User-Agent (like the fix in postmypost.ts)
  console.log('\n=== Step 2: Download WITH User-Agent ===');
  const dlWithUA = await fetch(videoUrl, { headers: { 'User-Agent': UA } });
  const bufWithUA = Buffer.from(await dlWithUA.arrayBuffer());
  const hasAudioWithUA = await checkAudio('With UA', bufWithUA);
  
  // Step 3: Download WITHOUT User-Agent (how it was before)
  console.log('\n=== Step 3: Download WITHOUT User-Agent ===');
  const dlNoUA = await fetch(videoUrl);
  const bufNoUA = Buffer.from(await dlNoUA.arrayBuffer());
  const hasAudioNoUA = await checkAudio('No UA', bufNoUA);
  
  // Summary
  console.log('\n=== SUMMARY ===');
  if (hasAudioWithUA && hasAudioNoUA) {
    console.log('Both downloads have audio - User-Agent doesnt matter for download');
  } else if (hasAudioWithUA && !hasAudioNoUA) {
    console.log('User-Agent on DOWNLOAD makes the difference!');
  } else if (!hasAudioWithUA && !hasAudioNoUA) {
    console.log('Neither download has audio - RapidAPI gave us a bad URL');
  }
}

test().catch(console.error);
