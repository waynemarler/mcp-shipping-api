const crypto = require('crypto');
const https = require('https');

// Use your production secret
const secret = 'b50fda56906e2da62889be510aad7a9d42d2b537c82363b77fcf373c5da64429';
const publicKey = 'pc4y_pub_prod';

// Test case: 1 package under 300cm + 1 package over 300cm
const testData = {
  cartId: "test-mixed-sizes",
  destination: {
    country: "GB",
    postalCode: "HP19",
    city: "Aylesbury"
  },
  items: [
    {
      sku: "PINE-SMALL",
      name: "Small Pine Board",
      length_mm: 1200,  // 120cm
      width_mm: 400,    // 40cm
      thickness_mm: 50, // 5cm
      weight_kg: 15,
      qty: 1
    },
    {
      sku: "PINE-LARGE",
      name: "Large Pine Board",
      length_mm: 1800,  // 180cm
      width_mm: 700,    // 70cm
      thickness_mm: 100, // 10cm
      weight_kg: 25,
      qty: 1
    }
  ]
};

// Calculate expected girths with padding
const girth1WithPadding = (120 + 6) + 2 * ((40 + 6) + (5 + 6)); // 126 + 2*(46 + 11) = 126 + 114 = 240cm
const girth2WithPadding = (180 + 6) + 2 * ((70 + 6) + (10 + 6)); // 186 + 2*(76 + 16) = 186 + 184 = 370cm

console.log('Testing mixed package sizes:');
console.log('\nPackage 1 (Small):');
console.log('  Dimensions: 120cm x 40cm x 5cm, 15kg');
console.log('  With padding: 126cm x 46cm x 11cm');
console.log('  Girth with padding: ' + girth1WithPadding + 'cm (< 300cm)');
console.log('  Expected: UPS Standard from P2G');

console.log('\nPackage 2 (Large):');
console.log('  Dimensions: 180cm x 70cm x 10cm, 25kg');
console.log('  With padding: 186cm x 76cm x 16cm');
console.log('  Girth with padding: ' + girth2WithPadding + 'cm (> 300cm)');
console.log('  Expected: DHL Express Medium static £68.51');

console.log('\nTotal weight: 40kg');
console.log('Expected behavior:');
console.log('- Package 1 should get real UPS quote from P2G');
console.log('- Package 2 should use static DHL pricing');
console.log('- 10% multi-package discount should apply\n');

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

console.log('Testing MCP API with mixed sizes...\n');

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
      
      if (response.subtotal && response.discount) {
        console.log(`\nSubtotal: £${response.subtotal}`);
        console.log(`Discount: £${response.discount} (10% multi-package)`);
      }
      
      console.log(`Total: £${response.total || 'N/A'} (${response.source || 'Unknown'})`);
      
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