const crypto = require('crypto');
const https = require('https');

// Use your production secret
const secret = 'b50fda56906e2da62889be510aad7a9d42d2b537c82363b77fcf373c5da64429';
const publicKey = 'pc4y_pub_prod';

// Test case: Exact dimensions L 100cm W 44cm H 6cm Weight 12kg
const testData = {
  cartId: "test-exact-dimensions",
  destination: {
    country: "GB",
    postalCode: "HP19",
    city: "Aylesbury"
  },
  items: [
    {
      sku: "PINE-EXACT",
      name: "Pine Board Exact Dimensions",
      length_mm: 1000,  // 100cm exactly
      width_mm: 440,    // 44cm exactly
      thickness_mm: 60, // 6cm exactly
      weight_kg: 12,    // 12kg exactly
      qty: 1
    }
  ]
};

// Calculate expected girth with padding
const girthWithPadding = (100 + 6) + 2 * ((44 + 6) + (6 + 6)); // 106 + 2*(50 + 12) = 106 + 124 = 230cm

console.log('Testing exact customer dimensions:');
console.log('\nPackage details:');
console.log('  Raw dimensions: L 100cm x W 44cm x H 6cm');
console.log('  Weight: 12kg');
console.log('  With 3cm padding each side: 106cm x 50cm x 12cm');
console.log('  Calculated girth: ' + girthWithPadding + 'cm');

console.log('\nExpected behavior:');
console.log('- Girth well under 300cm threshold ✓');
console.log('- Weight well under 30kg limit ✓');
console.log('- Should get UPS Standard via P2G');
console.log('- Single package, no multi-package discount\n');

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

console.log('Testing MCP API with exact dimensions...\n');

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
        
        console.log('\n=== PACKAGE BREAKDOWN ===');
        console.log(`Raw: ${testData.items[0].length_mm/10}cm x ${testData.items[0].width_mm/10}cm x ${testData.items[0].thickness_mm/10}cm`);
        console.log(`Packed: ${Math.round(p.length_mm/10)}cm x ${Math.round(p.width_mm/10)}cm x ${Math.round(p.height_mm/10)}cm`);
        console.log(`Weight: ${p.weight_kg}kg`);
      }
      
      console.log('\n=== ANALYSIS ===');
      if (response.source === 'Parcel2Go') {
        if (response.packages[0]?.service?.includes('UPS')) {
          console.log('✅ UPS Standard selected via P2G');
        } else {
          console.log('ℹ️  P2G returned non-UPS service');
        }
      } else {
        console.log('⚠️ Using static pricing instead of P2G');
      }
      
      // Show alternatives if available
      if (response.detailedPackages && response.detailedPackages[0]?.alternativeServices) {
        console.log('\nAlternative services:');
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