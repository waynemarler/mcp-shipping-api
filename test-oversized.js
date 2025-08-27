const crypto = require('crypto');
const https = require('https');

// Use your production secret
const secret = 'b50fda56906e2da62889be510aad7a9d42d2b537c82363b77fcf373c5da64429';
const publicKey = 'pc4y_pub_prod';

// Test case: Oversized package
const testData = {
  cartId: "test-oversized",
  destination: {
    country: "GB",
    postalCode: "HP19",
    city: "Aylesbury"
  },
  items: [{
    sku: "PINE-OVERSIZED",
    name: "Oversized Pine Board",
    length_mm: 2400,  // 240cm
    width_mm: 800,    // 80cm
    thickness_mm: 100, // 10cm
    weight_kg: 28,
    qty: 1
  }]
};

// Calculate girth
const girth = 240 + 2 * (80 + 10); // 240 + 180 = 420cm
console.log('Testing oversized package:');
console.log('Dimensions: 240cm x 80cm x 10cm');
console.log('Weight: 28kg');
console.log('Girth: ' + girth + 'cm (>300cm threshold)');
console.log('\nExpected behavior:');
console.log('- Should select DHL Express as preferred courier');
console.log('- With 3cm padding: 246cm x 86cm x 16cm');
console.log('- Girth with padding: ' + (246 + 2 * (86 + 16)) + 'cm\n');

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

console.log('Testing MCP API with oversized package...\n');

const req = https.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    
    try {
      const response = JSON.parse(data);
      
      // Simplified output - just show courier and price
      console.log('\n=== SHIPPING QUOTES ===');
      if (response.detailedPackages) {
        response.detailedPackages.forEach((pkg, i) => {
          console.log(`Package ${i + 1}: ${pkg.service || 'Unknown'} - £${pkg.price || 'N/A'} (${pkg.totalWeight}, ${pkg.dimensions})`);
          
          // Show alternative services if available
          if (pkg.alternativeServices && pkg.alternativeServices.length > 0) {
            console.log('  Alternatives:');
            pkg.alternativeServices.forEach(alt => {
              console.log(`    ${alt.service} (${alt.courier}) - £${alt.price} (${alt.deliveryDays || 'N/A'} days)`);
            });
          }
        });
      }
      
      console.log(`\nTotal: £${response.total || 'N/A'} (${response.source || 'Unknown'})`);
      
      if (response.packages && response.packages[0]) {
        const pkg = response.packages[0];
        const actualGirth = pkg.girth_mm / 10;
        console.log(`\nActual package girth: ${actualGirth}cm`);
        if (actualGirth > 300) {
          console.log('✓ Girth > 300cm - Should prefer DHL Express');
        } else {
          console.log('✓ Girth ≤ 300cm - Should prefer UPS Standard');
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