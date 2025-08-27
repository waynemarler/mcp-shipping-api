const crypto = require('crypto');
const https = require('https');

// Use your production secret
const secret = 'b50fda56906e2da62889be510aad7a9d42d2b537c82363b77fcf373c5da64429';
const publicKey = 'pc4y_pub_prod';

// Test case: 200cm girth, 12kg - well within limits
const testData = {
  cartId: "test-200cm-12kg",
  destination: {
    country: "GB",
    postalCode: "HP19",
    city: "Aylesbury"
  },
  items: [
    {
      sku: "PINE-200-12",
      name: "Pine Board 200cm/12kg",
      length_mm: 1000,  // 100cm
      width_mm: 300,    // 30cm
      thickness_mm: 40, // 4cm
      weight_kg: 12,
      qty: 1
    }
  ]
};

// Calculate expected girth with padding
const girthWithPadding = (100 + 6) + 2 * ((30 + 6) + (4 + 6)); // 106 + 2*(36 + 10) = 106 + 92 = 198cm

console.log('Testing small package: 200cm girth, 12kg weight');
console.log('\nPackage details:');
console.log('  Raw dimensions: 100cm x 30cm x 4cm');
console.log('  Weight: 12kg (well under limits)');
console.log('  With padding: 106cm x 36cm x 10cm');
console.log('  Calculated girth: ' + girthWithPadding + 'cm');

console.log('\nExpected behavior:');
console.log('- Girth well under 300cm threshold ✓');
console.log('- Weight well under 30kg limit ✓');
console.log('- Should definitely get UPS Standard via P2G');
console.log('- Should be cheapest UPS option available');
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
        console.log(`\nActual package girth: ${girthCm}cm`);
        console.log(`Service selected: ${p.service}`);
      }
      
      console.log('\n=== ANALYSIS ===');
      if (response.source === 'Parcel2Go') {
        if (response.packages[0]?.service?.includes('UPS')) {
          console.log('✅ Perfect! UPS Standard for small package');
          console.log('   This should be the most cost-effective option');
        } else {
          console.log('ℹ️  Got other P2G service (still good)');
        }
      } else {
        console.log('❌ Unexpected: Using static pricing for small package');
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