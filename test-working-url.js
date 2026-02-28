// Test script to download the working Instagram video URL and check for audio
const fs = require('fs');

const url = 'https://instagram.fmnl9-2.fna.fbcdn.net/o1/v/t16/f2/m69/AQNZitRPW3nDYAINfueyPmR-5qxHHhPIBdGS-19BiZHwbiSD4O2tBQvfbFdsXLqHzEqweQZaP5qSNZ3dLl2ws2Bx.mp4?strext=1&_nc_cat=111&_nc_oc=AdmG7PbDbYvUsZAzPCFM2ESKzB0yQmV1BcYIJvLYSh2fG3krgVplGna_gHbTQ2xGhnU&_nc_sid=5e9851&_nc_ht=instagram.fmnl9-2.fna.fbcdn.net&_nc_ohc=bfWr2iiKDVEQ7kNvwFZYcIG&efg=eyJ2ZW5jb2RlX3RhZyI6Inhwdl9wcm9ncmVzc2l2ZS5JTlNUQUdSQU0uQ0xJUFMuQzMuMTI3Ni5kYXNoX2Jhc2VsaW5lXzFfdjEiLCJ4cHZfYXNzZXRfaWQiOjE3ODU0OTc0ODE2NjY5NzUwLCJhc3NldF9hZ2VfZGF5cyI6MiwidmlfdXNlY2FzZV9pZCI6MTAwOTksImR1cmF0aW9uX3MiOjM4LCJ1cmxnZW5fc291cmNlIjoid3d3In0%3D&ccb=17-1&_nc_gid=kZRoNLvAwuHuJecoDgrtqQ&_nc_zt=28&vs=69499ef153af127d&_nc_vs=HBksFQIYOnBhc3N0aHJvdWdoX2V2ZXJzdG9yZS9HSkdtTXlZMTVpaDdSSnNIQUZzZjB5RV8wdnQxYnNwVEFRQUYVAALIARIAFQIYUWlnX3hwdl9wbGFjZW1lbnRfcGVybWFuZW50X3YyLzlENEU2NzhBRTJCMDgyMEU2MjYzNEIxRkVBMEMyQThFX2F1ZGlvX2Rhc2hpbml0Lm1wNBUCAsgBEgAoABgAGwKIB3VzZV9vaWwBMRJwcm9ncmVzc2l2ZV9yZWNpcGUBMRUAACbswN72qMC3PxUCKAJDMywXQENFP3ztkWgYEmRhc2hfYmFzZWxpbmVfMV92MREAdf4HZeadAQA&oh=00_AftDJqy_6P2vWcW0BMDskZJkFdtLFpM5pnbrCSEoPYUYlw&oe=69A7663D&dl=1';

async function test() {
  console.log('Downloading working video url...');
  const res = await fetch(url);
  console.log('Status:', res.status);
  
  const buffer = Buffer.from(await res.arrayBuffer());
  console.log('Size:', buffer.length);
  
  const str = buffer.toString('latin1');
  console.log('Has smhd (audio):', str.includes('smhd'));
  console.log('Has mp4a (AAC):', str.includes('mp4a'));
}

test().catch(console.error);
