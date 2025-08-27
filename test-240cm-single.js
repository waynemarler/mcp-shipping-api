const crypto = require('crypto');
const https = require('https');

// Use your production secret
const secret = 'b50fda56906e2da62889be510aad7a9d42d2b537c82363b77fcf373c5da64429';
const publicKey = 'pc4y_pub_prod';

// Test case: Single package at 240cm girth
const testData = {
  cartId: "test-240cm-single",
  destination: {
    country: "GB",
    postalCode: "HP19",
    city: "Aylesbury"
  },
  items: [
    {
      sku: "PINE-240",
      name: "Pine Board 240cm girth",
      length_mm: 1200,  // 120cm
      width_mm: 400,    // 40cm
      thickness_mm: 50, // 5cm
      weight_kg: 15,
      qty: 1
    }
  ]
};

// Calculate expected girth with padding
const girthWithPadding = (120 + 6) + 2 * ((40 + 6) + (5 + 6)); // 126 + 2*(46 + 11) = 126 + 114 = 240cm

console.log('Testing single package at 240cm girth:');
console.log('\nPackage details:');
console.log('  Dimensions: 120cm x 40cm x 5cm');
console.log('  Weight: 15kg');
console.log('  With padding: 126cm x 46cm x 11cm');
console.log('  Girth with padding: ' + girthWithPadding + 'cm');

console.log('\nExpected behavior:');
console.log('- Girth < 300cm, so should prefer UPS Standard');
console.log('- Should get real quote from P2G');
console.log('- If no UPS available, should fall back to static pricing');
console.log('- No multi-package discount (single package)\n');

const body = JSON.stringify(testData);
const timestamp = Date.now().toString();
const signature = crypto.createHmac('sha256', secret)
  .update(timestamp + '.' + body)
  .digest('hex');

const options = {
  hostname: 'mcp-shipping-api.vercel.app',
  port: 443,
  path: '/api/instant-quote-p2g',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'X-PC4Y-Key': publicKey,
    'X-PC4Y-Timestamp': timestamp,
    'X-PC4Y-Signature': signature
  }
};

console.log('Testing MCP API...\n');

const req = https.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    
    try {
      const response = JSON.parse(data);
      
      console.log('\n=== RESULT ===');
      if (response.detailedPackages && response.detailedPackages[0]) {
        const pkg = response.detailedPackages[0];
        console.log(`Service: ${pkg.service || 'Unknown'}`);
        console.log(`Price: £${pkg.price || 'N/A'}`);
        console.log(`Dimensions: ${pkg.dimensions}`);
        console.log(`Weight: ${pkg.totalWeight}`);
      }
      
      console.log(`\nTotal: £${response.total || 'N/A'}`);
      console.log(`Source: ${response.source || 'Unknown'}`);
      
      if (response.packages && response.packages[0]) {
        const p = response.packages[0];
        const girthCm = p.girth_mm / 10;
        console.log(`\nPackage girth: ${girthCm}cm`);
        console.log(`Service selected: ${p.service}`);
      }
      
      console.log('\n=== ANALYSIS ===');
      if (response.source === 'Parcel2Go') {
        if (response.packages[0]?.service?.includes('UPS')) {
          console.log('✅ Got UPS quote from P2G as expected!');
        } else {
          console.log('⚠️ P2G returned quotes but not UPS');
          console.log('   Possibly no UPS service available for this route/size');
        }
      } else {
        console.log('⚠️ Using static pricing - P2G returned no quotes');
      }
      
      // Show alternatives if available
      if (response.detailedPackages && response.detailedPackages[0]?.alternativeServices) {
        console.log('\nAlternative services available:');
        response.detailedPackages[0].alternativeServices.forEach(alt => {
          console.log(`  - ${alt.service} (${alt.courier}) - £${alt.price}`);
        });
      }
    } catch (e) {
      console.log('Raw response:', data);
    }
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.write(body);
req.end();