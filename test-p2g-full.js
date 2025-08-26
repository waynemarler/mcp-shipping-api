const crypto = require('crypto');
const https = require('https');

// Use your production secret
const secret = 'b50fda56906e2da62889be510aad7a9d42d2b537c82363b77fcf373c5da64429';
const publicKey = 'pc4y_pub_prod';

// Test case: 9 boards with Parcel2Go integration
const testData = {
  cartId: "test-p2g-9x27mm",
  destination: {
    country: "GB",
    postalCode: "SW1A 1AA",  // Westminster, London
    city: "London"
  },
  items: []
};

// Generate 9 identical boards (600 kg/m³ density)
for (let i = 1; i <= 9; i++) {
  testData.items.push({
    sku: "PINE-27",
    name: `27mm Pine Board ${i}`,
    length_mm: 900,
    width_mm: 330,
    thickness_mm: 27,
    weight_kg: 4.81,
    qty: 1
  });
}

// Calculate total weight
const totalWeight = testData.items.reduce((sum, item) => sum + item.weight_kg * (item.qty || 1), 0);
console.log('=== TEST SCENARIO ===');
console.log('Total weight of all boards:', totalWeight.toFixed(1) + 'kg');
console.log('Number of boards:', testData.items.length);
console.log('Board dimensions: 900mm x 330mm x 27mm');
console.log('Destination:', testData.destination.city, testData.destination.postalCode);
console.log('\nExpected behavior:');
console.log('- Should split into 2 packages (~21-22kg each)');
console.log('- Should get real quotes from Parcel2Go if configured');
console.log('- Falls back to static pricing if P2G not available\n');

const body = JSON.stringify(testData);
const timestamp = Date.now().toString();
const signature = crypto.createHmac('sha256', secret)
  .update(timestamp + '.' + body)
  .digest('hex');

// Test both endpoints
const endpoints = [
  { name: 'Static Pricing', path: '/api/instant-quote' },
  { name: 'Parcel2Go Integration', path: '/api/instant-quote-p2g' }
];

async function testEndpoint(endpoint) {
  return new Promise((resolve) => {
    console.log(`\n=== Testing ${endpoint.name} ===`);
    
    const options = {
      hostname: 'mcp-shipping-api.vercel.app',
      port: 443,
      path: endpoint.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-PC4Y-Key': publicKey,
        'X-PC4Y-Timestamp': timestamp,
        'X-PC4Y-Signature': signature
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log('Status:', res.statusCode);
        
        try {
          const response = JSON.parse(data);
          
          if (response.source) {
            console.log('Quote Source:', response.source);
          }
          
          if (response.detailedPackages) {
            response.detailedPackages.forEach((pkg) => {
              console.log(`\nPackage ${pkg.packageNumber}:`);
              console.log(`  Weight: ${pkg.totalWeight}`);
              console.log(`  Dimensions: ${pkg.dimensions}`);
              console.log(`  Service: ${pkg.service}`);
              console.log(`  Price: £${pkg.price}`);
              
              // Show alternative services if available (P2G only)
              if (pkg.alternativeServices) {
                console.log('  Alternative Services:');
                pkg.alternativeServices.forEach(alt => {
                  console.log(`    - ${alt.service}: £${alt.price} (${alt.deliveryDays} days)`);
                });
              }
            });
          }
          
          console.log(`\nTotal: £${response.total}`);
          
        } catch (e) {
          console.log('Error parsing response:', e.message);
          console.log('Raw response:', data.substring(0, 500));
        }
        
        resolve();
      });
    });

    req.on('error', (e) => {
      console.error(`Problem with request: ${e.message}`);
      resolve();
    });

    req.write(body);
    req.end();
  });
}

// Test both endpoints sequentially
async function runTests() {
  for (const endpoint of endpoints) {
    await testEndpoint(endpoint);
  }
  
  console.log('\n=== NOTES ===');
  console.log('- If P2G integration shows "Static" source, set these env vars in Vercel:');
  console.log('  P2G_CLIENT_ID, P2G_CLIENT_SECRET, P2G_ENVIRONMENT');
  console.log('- P2G provides real-time quotes from multiple carriers');
  console.log('- Static pricing is used as fallback');
}

runTests();