const crypto = require('crypto');
const https = require('https');

// Use your production secret
const secret = 'b50fda56906e2da62889be510aad7a9d42d2b537c82363b77fcf373c5da64429';
const publicKey = 'pc4y_pub_prod';

// Test case: 2 under 300cm (UPS API) + 2 over 300cm (DHL static)
const testData = {
  cartId: "test-mixed-ups-dhl",
  destination: {
    country: "GB",
    postalCode: "HP19",
    city: "Aylesbury"
  },
  items: [
    {
      sku: "PINE-SMALL-1",
      name: "Small Pine Board 1",
      length_mm: 900,   // 90cm
      width_mm: 400,    // 40cm
      thickness_mm: 50, // 5cm
      weight_kg: 10,
      qty: 1
    },
    {
      sku: "PINE-SMALL-2", 
      name: "Small Pine Board 2",
      length_mm: 1000,  // 100cm
      width_mm: 350,    // 35cm
      thickness_mm: 60, // 6cm
      weight_kg: 12,
      qty: 1
    },
    {
      sku: "PINE-LARGE-1",
      name: "Large Pine Board 1", 
      length_mm: 1800,  // 180cm
      width_mm: 650,    // 65cm
      thickness_mm: 90, // 9cm
      weight_kg: 25,
      qty: 1
    },
    {
      sku: "PINE-LARGE-2",
      name: "Large Pine Board 2",
      length_mm: 2000,  // 200cm
      width_mm: 700,    // 70cm
      thickness_mm: 100, // 10cm
      weight_kg: 28,
      qty: 1
    }
  ]
};

// Calculate expected girths with padding
const girth1 = (90 + 6) + 2 * ((40 + 6) + (5 + 6));   // 96 + 2*(46 + 11) = 210cm
const girth2 = (100 + 6) + 2 * ((35 + 6) + (6 + 6));  // 106 + 2*(41 + 12) = 212cm  
const girth3 = (180 + 6) + 2 * ((65 + 6) + (9 + 6));  // 186 + 2*(71 + 15) = 358cm
const girth4 = (200 + 6) + 2 * ((70 + 6) + (10 + 6)); // 206 + 2*(76 + 16) = 374cm

console.log('Testing mixed scenario: 2 small (UPS) + 2 large (DHL static)');
console.log('\nPackage 1 (Small - UPS):');
console.log('  Dimensions: 90cm x 40cm x 5cm, 10kg');
console.log('  Girth: ' + girth1 + 'cm (< 300cm → UPS via P2G)');

console.log('\nPackage 2 (Small - UPS):');
console.log('  Dimensions: 100cm x 35cm x 6cm, 12kg');
console.log('  Girth: ' + girth2 + 'cm (< 300cm → UPS via P2G)');

console.log('\nPackage 3 (Large - DHL):');
console.log('  Dimensions: 180cm x 65cm x 9cm, 25kg');
console.log('  Girth: ' + girth3 + 'cm (> 300cm → DHL static)');

console.log('\nPackage 4 (Large - DHL):');
console.log('  Dimensions: 200cm x 70cm x 10cm, 28kg');
console.log('  Girth: ' + girth4 + 'cm (> 300cm → DHL static)');

console.log('\nTotal weight: 75kg');
console.log('\nExpected behavior:');
console.log('- P2G API call for packages 1+2 (both < 300cm)');
console.log('- Static DHL pricing for packages 3+4 (both > 300cm)');
console.log('- Mixed couriers (UPS + DHL) = NO discount');
console.log('- Should see both Parcel2Go and Static sources\n');

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

console.log('Testing MCP API with mixed UPS + DHL scenario...\n');

const req = https.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    
    try {
      const response = JSON.parse(data);
      
      console.log('\n=== SHIPPING QUOTES ===');
      if (response.detailedPackages) {
        response.detailedPackages.forEach((pkg, i) => {
          console.log(`Package ${i + 1}: ${pkg.service || 'Unknown'} - £${pkg.price || 'N/A'} (${pkg.totalWeight}, ${pkg.dimensions})`);
        });
      }
      
      if (response.subtotal && response.discount !== undefined) {
        console.log(`\nSubtotal: £${response.subtotal}`);
        console.log(`Discount: £${response.discount}`);
      }
      
      console.log(`Total: £${response.total || 'N/A'} (Source: ${response.source || 'Unknown'})`);
      
      if (response.packages) {
        console.log('\n=== PACKAGE DETAILS ===');
        response.packages.forEach((p, i) => {
          const girthCm = p.girth_mm / 10;
          console.log(`Package ${i + 1}: ${girthCm}cm girth - ${p.service}`);
        });
      }
      
      if (response.discountMessage) {
        console.log('\n' + response.discountMessage);
      }
      
      console.log('\n=== ANALYSIS ===');
      
      // Check courier distribution
      if (response.packages) {
        const upsPackages = response.packages.filter(p => p.service.includes('UPS')).length;
        const dhlPackages = response.packages.filter(p => p.service.includes('DHL')).length;
        
        console.log(`UPS packages: ${upsPackages} (should be 2 small packages)`);
        console.log(`DHL packages: ${dhlPackages} (should be 2 large packages)`);
        
        if (upsPackages === 2 && dhlPackages === 2) {
          console.log('✅ Perfect courier distribution!');
        } else {
          console.log('⚠️ Unexpected courier distribution');
        }
        
        // Check discount logic
        if (response.discount === 0) {
          console.log('✅ Correct: No discount for mixed couriers');
        } else {
          console.log('⚠️ Unexpected: Discount applied to mixed couriers');
        }
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