const https = require('https');

const data = JSON.stringify({
  text: "Hello world",
  model_id: "eleven_turbo_v2_5",
  voice_settings: {
    stability: 0.5,
    similarity_boost: 0.75
  }
});

const options = {
  hostname: 'api.elevenlabs.io',
  path: '/v1/text-to-speech/pFZP5JQG7iQjIQuC4Bku',
  method: 'POST',
  headers: {
    'Accept': 'audio/mpeg',
    'Content-Type': 'application/json',
    'xi-api-key': 'sk_9057eb8c6dcbb09eeb68298bb8f1f5c633aea3cd824509a9'
  }
};

const req = https.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.on('data', (d) => {
    process.stdout.write(d.toString('utf8').substring(0, 100)); // Print just error message if it fails
  });
});

req.on('error', (error) => {
  console.error('ERROR:', error);
});

req.write(data);
req.end();
