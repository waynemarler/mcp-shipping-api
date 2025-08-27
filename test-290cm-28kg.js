const crypto = require('crypto');
const https = require('https');

// Use your production secret
const secret = 'b50fda56906e2da62889be510aad7a9d42d2b537c82363b77fcf373c5da64429';
const publicKey = 'pc4y_pub_prod';

// Test case: 290cm girth, 28kg - right at the limits
const testData = {
  cartId: "test-290cm-28kg",
  destination: {
    country: "GB",
    postalCode: "HP19",
    city: "Aylesbury"
  },
  items: [
    {
      sku: "PINE-290-28",
      name: "Pine Board 290cm/28kg",
      length_mm: 1400,  // 140cm
      width_mm: 500,    // 50cm
      thickness_mm: 80, // 8cm
      weight_kg: 28,
      qty: 1
    }
  ]
};

// Calculate expected girth with padding
const girthWithPadding = (140 + 6) + 2 * ((50 + 6) + (8 + 6)); // 146 + 2*(56 + 14) = 146 + 140 = 286cm

console.log('Testing edge case: 290cm girth, 28kg weight');
console.log('\nPackage details:');
console.log('  Raw dimensions: 140cm x 50cm x 8cm');
console.log('  Weight: 28kg (close to 30kg limit)');
console.log('  With padding: 146cm x 56cm x 14cm');
console.log('  Calculated girth: ' + girthWithPadding + 'cm');

console.log('\nExpected behavior:');
console.log('- Girth < 300cm threshold ✓');
console.log('- Weight close to 30kg limit');
console.log('- Should attempt UPS Standard via P2G');
console.log('- Test if UPS accepts heavy packages near girth limit');
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
        
        if (girthCm < 300) {
          console.log('✓ Girth under 300cm threshold');
        } else {
          console.log('⚠️ Girth over 300cm threshold');
        }
      }
      
      console.log('\n=== ANALYSIS ===');
      if (response.source === 'Parcel2Go') {
        if (response.packages[0]?.service?.includes('UPS')) {
          console.log('✅ UPS accepted the 28kg package!');
        } else if (response.packages[0]?.service?.includes('DHL')) {
          console.log('✅ DHL accepted via P2G');
        } else {
          console.log('⚠️ P2G returned non-UPS/DHL service');
        }
      } else {
        console.log('⚠️ Using static pricing - P2G couldn\'t quote');
        console.log('   Weight/size combination might be at carrier limits');
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