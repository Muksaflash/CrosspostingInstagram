const https = require('https');
const RAPIDAPI_KEY = "a5540b9e3amsh037c0ff736afabdp13ee5ajsn981e3c178da3";
const RAPIDAPI_HOST = 'instagram120.p.rapidapi.com';

const body = JSON.stringify({ url: 'https://www.instagram.com/p/DVK_dlvCKrS/' });
const options = {
  method: 'POST',
  hostname: RAPIDAPI_HOST,
  path: '/api/instagram/links',
  headers: {
    'content-type': 'application/json',
    'x-rapidapi-host': RAPIDAPI_HOST,
    'x-rapidapi-key': RAPIDAPI_KEY,
    'User-Agent': 'Mozilla/5.0'
  }
};

const req = https.request(options, (res) => {
  console.log("--- ALL HEADERS ---");
  for (const [key, value] of Object.entries(res.headers)) {
    if (key.includes('ratelimit')) {
      console.log(`${key}: ${value}`);
    }
  }
  res.on('data', () => {});
});
req.write(body);
req.end();
