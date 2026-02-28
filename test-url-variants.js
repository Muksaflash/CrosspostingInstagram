// Test: try alternative URL patterns to get full MP4 with audio from Instagram
const fs = require('fs');

const originalUrl = 'https://scontent-fra3-2.cdninstagram.com/o1/v/t16/f2/m69/AQNZitRPW3nDYAINfueyPmR-5qxHHhPIBdGS-19BiZHwbiSD4O2tBQvfbFdsXLqHzEqweQZaP5qSNZ3dLl2ws2Bx.mp4?strext=1&_nc_cat=111&_nc_sid=5e9851&_nc_ht=scontent-fra3-2.cdninstagram.com&_nc_ohc=bfWr2iiKDVEQ7kNvwHQ5DhZ&efg=eyJ2ZW5jb2RlX3RhZyI6Inhwdl9wcm9ncmVzc2l2ZS5JTlNUQUdSQU0uQ0xJUFMuQzMuMTI3Ni5kYXNoX2Jhc2VsaW5lXzFfdjEiLCJ4cHZfYXNzZXRfaWQiOjE3ODU0OTc0ODE2NjY5NzUwLCJhc3NldF9hZ2VfZGF5cyI6MSwidmlfdXNlY2FzZV9pZCI6MTAwOTksImR1cmF0aW9uX3MiOjM4LCJ1cmxnZW5fc291cmNlIjoid3d3In0%3D&ccb=17-1&_nc_gid=YglrwYg9l1ePraJ-3Jh_PA&_nc_zt=28&vs=47192ac8b2b48190&_nc_vs=HBkcFQIYOnBhc3N0aHJvdWdoX2V2ZXJzdG9yZS9HSkdtTXlZMTVpaDdSSnNIQUZzZjB5RV8wdnQxYnNwVEFRQUYVAALIARIAKAAYABsCiAd1c2Vfb2lsATEScHJvZ3Jlc3NpdmVfcmVjaXBlATEVAAAm7MDe9qjAtz8VAigCQzMsF0BDRT987ZFoGBJkYXNoX2Jhc2VsaW5lXzFfdjERAHX-B2XmnQEA&oh=00_Afu3U_4oIP46qtXI3RsS6u9A2kV-YuRlYUsXrZpmDbsiXw&oe=69A64CFD&dl=1';

async function checkUrl(label, url) {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    console.log(`${label}: ${res.status} (${res.headers.get('content-type')}, ${res.headers.get('content-length')} bytes)`);
    if (res.ok) {
      // Download and check for audio
      const res2 = await fetch(url);
      const buf = Buffer.from(await res2.arrayBuffer());
      const str = buf.toString('latin1');
      const hasAudio = str.includes('smhd') || str.includes('mp4a');
      console.log(`  Audio: ${hasAudio ? '✅ YES' : '❌ NO'}, Size: ${buf.length}`);
    }
    return res.status;
  } catch (e) {
    console.log(`${label}: FAILED - ${e.message}`);
    return 0;
  }
}

async function test() {
  // Test 1: Original URL (DASH)
  await checkUrl('Original (strext=1)', originalUrl);
  
  // Test 2: Remove strext=1 entirely
  const noStrext = originalUrl.replace('strext=1&', '');
  await checkUrl('No strext param', noStrext);
  
  // Test 3: Change f2 to f1 in path (different format)
  const f1Url = originalUrl.replace('/f2/', '/f1/');
  await checkUrl('f1 format', f1Url);
  
  // Test 4: Change m69 to m86 (different media variant) 
  const m86Url = originalUrl.replace('/m69/', '/m86/');
  await checkUrl('m86 variant', m86Url);
  
  // Test 5: Try Instagram's embed/download page approach
  const postUrl = 'https://www.instagram.com/p/DVK_dlvCKrS/';
  console.log(`\nPost URL: ${postUrl}`);
  console.log('(embed approach would need browser or scraping)');
}

test().catch(e => console.error(e));
