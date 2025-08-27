const crypto = require('crypto');
const https = require('https');

// Use your production secret
const secret = 'b50fda56906e2da62889be510aad7a9d42d2b537c82363b77fcf373c5da64429';
const publicKey = 'pc4y_pub_prod';

// Test case: 2 oversized packages - should use DHL static only
const testData = {
  cartId: "test-2-oversized-dhl",
  destination: {
    country: "GB",
    postalCode: "HP19",
    city: "Aylesbury"
  },
  items: [
    {
      sku: "PINE-OVERSIZED-1",
      name: "Oversized Pine Board 1",
      length_mm: 2000,  // 200cm
      width_mm: 700,    // 70cm
      thickness_mm: 100, // 10cm
      weight_kg: 26,
      qty: 1
    },
    {
      sku: "PINE-OVERSIZED-2",
      name: "Oversized Pine Board 2", 
      length_mm: 2200,  // 220cm
      width_mm: 800,    // 80cm
      thickness_mm: 120, // 12cm
      weight_kg: 29,
      qty: 1
    }
  ]
};

// Calculate girths with padding
const girth1 = (200 + 6) + 2 * ((70 + 6) + (10 + 6)); // 206 + 2*(76 + 16) = 390cm
const girth2 = (220 + 6) + 2 * ((80 + 6) + (12 + 6)); // 226 + 2*(86 + 18) = 434cm

console.log('Testing 2 oversized packages - DHL static only:');
console.log('\nPackage 1 (Oversized):');
console.log('  Raw: 200cm x 70cm x 10cm, 26kg');
console.log('  With padding: 206cm x 76cm x 16cm');
console.log('  Girth: ' + girth1 + 'cm (>300cm → DHL static)');

console.log('\nPackage 2 (Oversized):');
console.log('  Raw: 220cm x 80cm x 12cm, 29kg');
console.log('  With padding: 226cm x 86cm x 18cm');
console.log('  Girth: ' + girth2 + 'cm (>300cm → DHL static)');

console.log('\nTotal weight: 55kg');
console.log('\nExpected behavior:');
console.log('- NO P2G API call (both packages >300cm)');
console.log('- Package 1: DHL Express Large £74.76 (390cm = 381-420cm tier)');
console.log('- Package 2: DHL Express XL £89.67 (434cm = >420cm tier)');
console.log('- Same service discount: Both DHL → 10% off');
console.log('- Total: £164.43 → £147.99 after discount\n');

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

console.log('Testing MCP API with 2 oversized packages...\n');

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
        console.log(`Discount: £${response.discount} (10% same service)`);
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
      
      console.log('\n=== ANALYSIS ===');
      if (response.source === 'Static') {
        console.log('✅ Perfect! Using static pricing (no P2G call)');
      } else if (response.source === 'Parcel2Go') {
        console.log('⚠️ Unexpected: Shows P2G source but should be static only');
      }
      
      // Check if both services are DHL for discount validation
      if (response.packages) {
        const services = response.packages.map(p => p.service);
        const uniqueServices = [...new Set(services)];
        if (uniqueServices.length === 1 && services[0].includes('DHL')) {
          console.log('✅ Both packages using same DHL service - discount should apply');
        } else if (uniqueServices.length > 1) {
          console.log('⚠️ Mixed services - no discount should apply');
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