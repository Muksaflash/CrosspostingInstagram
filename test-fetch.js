const http = require('https');

const options = {
	method: 'POST',
	hostname: 'instagram120.p.rapidapi.com',
	port: null,
	path: '/api/instagram/mediaByShortcode',
	headers: {
		'x-rapidapi-key': 'a5540b9e3amsh037c0ff736afabdp13ee5ajsn981e3c178da3',
		'x-rapidapi-host': 'instagram120.p.rapidapi.com',
		'Content-Type': 'application/json'
	}
};

const req = http.request(options, function (res) {
	const chunks = [];

	res.on('data', function (chunk) {
		chunks.push(chunk);
	});

	res.on('end', function () {
		const body = Buffer.concat(chunks);
		console.log(body.toString());
	});
});

req.write(JSON.stringify({
  shortcode: 'DU6RVgliIxy'
}));
req.end();
