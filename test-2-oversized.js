const crypto = require('crypto');
const https = require('https');

// Use your production secret
const secret = 'b50fda56906e2da62889be510aad7a9d42d2b537c82363b77fcf373c5da64429';
const publicKey = 'pc4y_pub_prod';

// Test case: 2 Oversized packages
const testData = {
  cartId: "test-2-oversized",
  destination: {
    country: "GB",
    postalCode: "HP19",
    city: "Aylesbury"
  },
  items: [
    {
      sku: "PINE-OVERSIZED-1",
      name: "Oversized Pine Board 1",
      length_mm: 2200,  // 220cm
      width_mm: 700,    // 70cm
      thickness_mm: 80,  // 8cm
      weight_kg: 25,
      qty: 1
    },
    {
      sku: "PINE-OVERSIZED-2", 
      name: "Oversized Pine Board 2",
      length_mm: 2400,  // 240cm
      width_mm: 800,    // 80cm
      thickness_mm: 100, // 10cm
      weight_kg: 28,
      qty: 1
    }
  ]
};

// Calculate girths
const girth1 = 220 + 2 * (70 + 8); // 220 + 156 = 376cm
const girth2 = 240 + 2 * (80 + 10); // 240 + 180 = 420cm
const totalWeight = 25 + 28; // 53kg

console.log('Testing 2 oversized packages:');
console.log('Package 1: 220cm x 70cm x 8cm, 25kg, Girth: ' + girth1 + 'cm');
console.log('Package 2: 240cm x 80cm x 10cm, 28kg, Girth: ' + girth2 + 'cm');
console.log('Total weight: ' + totalWeight + 'kg (exceeds 30kg max)');
console.log('\nExpected behavior:');
console.log('- Both packages >300cm girth - should split due to weight');
console.log('- Should use static pricing: DHL Express Large £70 each');
console.log('- Total: £140\n');

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
          
          if (pkg.alternativeServices && pkg.alternativeServices.length > 0) {
            console.log('  Alternatives:');
            pkg.alternativeServices.forEach(alt => {
              console.log(`    ${alt.service} (${alt.courier}) - £${alt.price} (${alt.deliveryDays || 'N/A'} days)`);
            });
          }
        });
      }
      
      console.log(`\nTotal: £${response.total || 'N/A'} (${response.source || 'Unknown'})`);
      
      if (response.packages) {
        const weights = response.packages.map(p => p.weight_kg);
        const girths = response.packages.map(p => p.girth_mm / 10);
        const variance = Math.max(...weights) - Math.min(...weights);
        console.log(`Weight balance: ${weights.map(w => w + 'kg').join(', ')} (variance: ${variance.toFixed(1)}kg)`);
        console.log(`Package girths: ${girths.map(g => g + 'cm').join(', ')}`);
        
        girths.forEach((g, i) => {
          if (g > 300) {
            console.log(`✓ Package ${i + 1} girth ${g}cm > 300cm - Should use DHL Express Large`);
          } else {
            console.log(`✓ Package ${i + 1} girth ${g}cm ≤ 300cm - Should use UPS Standard`);
          }
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