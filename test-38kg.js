const crypto = require('crypto');
const https = require('https');

// Use your production secret
const secret = 'b50fda56906e2da62889be510aad7a9d42d2b537c82363b77fcf373c5da64429';
const publicKey = 'pc4y_pub_prod';

// Test case: 8 boards totaling 38kg
const testData = {
  cartId: "test-38kg",
  destination: {
    country: "GB",
    postalCode: "HP19",
    city: "Aylesbury"
  },
  items: [
    {
      sku: "PINE-18",
      name: "18mm Pine Board 1",
      length_mm: 2080,
      width_mm: 250,
      thickness_mm: 18,
      weight_kg: 5.7,
      qty: 1
    },
    {
      sku: "PINE-18",
      name: "18mm Pine Board 2",
      length_mm: 1800,
      width_mm: 300,
      thickness_mm: 18,
      weight_kg: 5.9,
      qty: 1
    },
    {
      sku: "PINE-18",
      name: "18mm Pine Board 3",
      length_mm: 1600,
      width_mm: 280,
      thickness_mm: 18,
      weight_kg: 4.9,
      qty: 1
    },
    {
      sku: "PINE-18",
      name: "18mm Pine Board 4",
      length_mm: 1500,
      width_mm: 320,
      thickness_mm: 18,
      weight_kg: 5.3,
      qty: 1
    },
    {
      sku: "PINE-18",
      name: "18mm Pine Board 5",
      length_mm: 1400,
      width_mm: 260,
      thickness_mm: 18,
      weight_kg: 4.0,
      qty: 1
    },
    {
      sku: "PINE-18",
      name: "18mm Pine Board 6",
      length_mm: 1300,
      width_mm: 290,
      thickness_mm: 18,
      weight_kg: 4.1,
      qty: 1
    },
    {
      sku: "PINE-18",
      name: "18mm Pine Board 7",
      length_mm: 1200,
      width_mm: 310,
      thickness_mm: 18,
      weight_kg: 4.1,
      qty: 1
    },
    {
      sku: "PINE-18",
      name: "18mm Pine Board 8",
      length_mm: 1100,
      width_mm: 270,
      thickness_mm: 18,
      weight_kg: 3.3,
      qty: 1
    }
  ],
  preferences: {
    speed: "cheapest",
    allowSplit: true
  }
};

// Calculate total weight
const totalWeight = testData.items.reduce((sum, item) => sum + item.weight_kg * (item.qty || 1), 0);
console.log('Total weight of all boards:', totalWeight.toFixed(1) + 'kg');
console.log('Number of boards:', testData.items.length);
console.log('\nExpected behavior:');
console.log('- Should split into 2 packages (38kg > 30kg max)');
console.log('- Should balance weights (e.g., ~19kg each, not 30kg + 8kg)');
console.log('- Each package priced based on its girth (Standard ≤300cm, Oversized >300cm)\n');

const body = JSON.stringify(testData);
const timestamp = Date.now().toString();
const signature = crypto.createHmac('sha256', secret)
  .update(timestamp + '.' + body)
  .digest('hex');

const options = {
  hostname: 'pinecut4you.co.uk',
  port: 443,
  path: '/mcp-shipping/instant-quote',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'X-PC4Y-Key': publicKey,
    'X-PC4Y-Timestamp': timestamp,
    'X-PC4Y-Signature': signature
  }
};

console.log('Testing MCP API with 38kg scenario...\n');

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
          console.log(`  Weight: ${pkg.weight_kg}kg`);
          console.log(`  Girth: ${girthCm}cm`);
          console.log(`  Service: ${pkg.service}`);
          console.log(`  Price: £${response.breakdown[i].price}`);
        });
        
        // Check weight distribution
        const weights = response.packages.map(p => p.weight_kg);
        const minWeight = Math.min(...weights);
        const maxWeight = Math.max(...weights);
        const variance = maxWeight - minWeight;
        
        console.log('\n=== WEIGHT DISTRIBUTION ===');
        console.log(`Packages: ${weights.map(w => w + 'kg').join(', ')}`);
        console.log(`Variance: ${variance.toFixed(1)}kg`);
        
        if (variance > 15) {
          console.log('⚠️  WARNING: Unbalanced weight distribution!');
          console.log('   Should aim for more even distribution.');
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