const crypto = require('crypto');
const https = require('https');

// Use your production secret
const secret = 'b50fda56906e2da62889be510aad7a9d42d2b537c82363b77fcf373c5da64429';
const publicKey = 'pc4y_pub_prod';

const testData = {
  cartId: "test123",
  destination: {
    country: "GB",
    postalCode: "HP19",
    city: "Aylesbury"
  },
  items: [
    {
      sku: "PINE-18",
      name: "18mm Pine",
      length_mm: 2080,
      width_mm: 230,
      thickness_mm: 18,
      weight_kg: 5.2,
      qty: 1
    },
    {
      sku: "PINE-18",
      name: "18mm Pine",
      length_mm: 1250,
      width_mm: 300,
      thickness_mm: 18,
      weight_kg: 4.1,
      qty: 6
    }
  ],
  preferences: {
    speed: "cheapest",
    allowSplit: true
  }
};

const body = JSON.stringify(testData);
const timestamp = Date.now().toString();
const signature = crypto.createHmac('sha256', secret)
  .update(timestamp + '.' + body)
  .digest('hex');

const options = {
  hostname: 'pinecut4you.co.uk',
  port: 443,
  path: '/mcp-shipping/instant-quote',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'X-PC4Y-Key': publicKey,
    'X-PC4Y-Timestamp': timestamp,
    'X-PC4Y-Signature': signature
  }
};

console.log('Testing Production MCP API...\n');
console.log('URL: https://pinecut4you.co.uk/mcp-shipping/instant-quote\n');

const req = https.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:');
    try {
      console.log(JSON.stringify(JSON.parse(data), null, 2));
    } catch (e) {
      console.log(data);
    }
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.write(body);
req.end();