// Test script to download Instagram video and check if it has audio
const fs = require('fs');

const url = 'https://scontent-fra3-2.cdninstagram.com/o1/v/t16/f2/m69/AQNZitRPW3nDYAINfueyPmR-5qxHHhPIBdGS-19BiZHwbiSD4O2tBQvfbFdsXLqHzEqweQZaP5qSNZ3dLl2ws2Bx.mp4?strext=1&_nc_cat=111&_nc_sid=5e9851&_nc_ht=scontent-fra3-2.cdninstagram.com&_nc_ohc=bfWr2iiKDVEQ7kNvwHQ5DhZ&efg=eyJ2ZW5jb2RlX3RhZyI6Inhwdl9wcm9ncmVzc2l2ZS5JTlNUQUdSQU0uQ0xJUFMuQzMuMTI3Ni5kYXNoX2Jhc2VsaW5lXzFfdjEiLCJ4cHZfYXNzZXRfaWQiOjE3ODU0OTc0ODE2NjY5NzUwLCJhc3NldF9hZ2VfZGF5cyI6MSwidmlfdXNlY2FzZV9pZCI6MTAwOTksImR1cmF0aW9uX3MiOjM4LCJ1cmxnZW5fc291cmNlIjoid3d3In0%3D&ccb=17-1&_nc_gid=YglrwYg9l1ePraJ-3Jh_PA&_nc_zt=28&vs=47192ac8b2b48190&_nc_vs=HBkcFQIYOnBhc3N0aHJvdWdoX2V2ZXJzdG9yZS9HSkdtTXlZMTVpaDdSSnNIQUZzZjB5RV8wdnQxYnNwVEFRQUYVAALIARIAKAAYABsCiAd1c2Vfb2lsATEScHJvZ3Jlc3NpdmVfcmVjaXBlATEVAAAm7MDe9qjAtz8VAigCQzMsF0BDRT987ZFoGBJkYXNoX2Jhc2VsaW5lXzFfdjERAHX-B2XmnQEA&oh=00_Afu3U_4oIP46qtXI3RsS6u9A2kV-YuRlYUsXrZpmDbsiXw&oe=69A64CFD&dl=1';

async function test() {
  console.log('Downloading video...');
  const res = await fetch(url);
  console.log('Status:', res.status);
  console.log('Content-Type:', res.headers.get('content-type'));
  console.log('Content-Length:', res.headers.get('content-length'));
  
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync('test-video.mp4', buffer);
  console.log('Saved to test-video.mp4, size:', buffer.length);
  
  // Check for audio atoms in MP4 container
  const str = buffer.toString('latin1');
  const hasSmhd = str.includes('smhd');
  const hasVmhd = str.includes('vmhd');
  const hasMp4a = str.includes('mp4a');
  const hasAvc1 = str.includes('avc1');
  
  console.log('\nMP4 Analysis:');
  console.log('  Has vmhd (video):', hasVmhd);
  console.log('  Has avc1 (H.264):', hasAvc1);  
  console.log('  Has smhd (audio):', hasSmhd);
  console.log('  Has mp4a (AAC):', hasMp4a);
  
  if (!hasSmhd && !hasMp4a) {
    console.log('\n❌ NO AUDIO TRACK - video-only DASH stream');
  } else {
    console.log('\n✅ Audio track found');
  }
}

test().catch(e => console.error(e));
