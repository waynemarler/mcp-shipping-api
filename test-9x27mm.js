const crypto = require('crypto');
const https = require('https');

// Use your production secret
const secret = 'b50fda56906e2da62889be510aad7a9d42d2b537c82363b77fcf373c5da64429';
const publicKey = 'pc4y_pub_prod';

// Test case: 9 boards of 27mm thick, 900mm x 330mm
const testData = {
  cartId: "test-9x27mm",
  destination: {
    country: "GB",
    postalCode: "HP19",
    city: "Aylesbury"
  },
  items: []
};

// Generate 9 identical boards
// Pine density 600 kg/m³, so 0.9m x 0.33m x 0.027m = 4.81kg per board
for (let i = 1; i <= 9; i++) {
  testData.items.push({
    sku: "PINE-27",
    name: `27mm Pine Board ${i}`,
    length_mm: 900,
    width_mm: 330,
    thickness_mm: 27,
    weight_kg: 4.81, // 600 kg/m³ density
    qty: 1
  });
}

// Calculate total weight
const totalWeight = testData.items.reduce((sum, item) => sum + item.weight_kg * (item.qty || 1), 0);
console.log('Total weight of all boards:', totalWeight.toFixed(1) + 'kg');
console.log('Number of boards:', testData.items.length);
console.log('Board dimensions: 900mm x 330mm x 27mm');
console.log('\nExpected behavior:');
console.log('- Total weight: 43.3kg (exceeds 30kg max)');
console.log('- Should split into 2 packages (~21-22kg each)');
console.log('- Girth per package: 900 + 2*(330 + height) = depends on stacking\n');

const body = JSON.stringify(testData);
const timestamp = Date.now().toString();
const signature = crypto.createHmac('sha256', secret)
  .update(timestamp + '.' + body)
  .digest('hex');

const options = {
  hostname: 'mcp-shipping-api.vercel.app',
  port: 443,
  path: '/api/instant-quote',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'X-PC4Y-Key': publicKey,
    'X-PC4Y-Timestamp': timestamp,
    'X-PC4Y-Signature': signature
  }
};

console.log('Testing MCP API with 9x27mm scenario...\n');

const req = https.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    
    try {
      const response = JSON.parse(data);
      console.log('\nResponse:');
      console.log(JSON.stringify(response, null, 2));
      
      if (response.packages) {
        console.log('\n=== PACKAGE ANALYSIS ===');
        response.packages.forEach((pkg, i) => {
          const girthCm = pkg.girth_mm / 10;
          console.log(`\nPackage ${i + 1}:`);
          console.log(`  Dimensions: ${pkg.length_mm}mm x ${pkg.width_mm}mm x ${pkg.height_mm}mm`);
          console.log(`  Weight: ${pkg.weight_kg}kg`);
          console.log(`  Girth: ${girthCm}cm`);
          console.log(`  Service: ${pkg.service}`);
          console.log(`  Price: £${response.breakdown[i].price}`);
          console.log(`  Items: ${pkg.items.join(', ')}`);
        });
        
        // Check weight distribution
        const weights = response.packages.map(p => p.weight_kg);
        const minWeight = Math.min(...weights);
        const maxWeight = Math.max(...weights);
        const variance = maxWeight - minWeight;
        
        console.log('\n=== WEIGHT DISTRIBUTION ===');
        console.log(`Packages: ${weights.map(w => w + 'kg').join(', ')}`);
        console.log(`Variance: ${variance.toFixed(1)}kg`);
        
        if (variance > 10) {
          console.log('⚠️  WARNING: Unbalanced weight distribution!');
        } else {
          console.log('✅ Good weight balance!');
        }
        
        console.log('\n=== TOTAL ===');
        console.log(`Total Price: £${response.total}`);
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