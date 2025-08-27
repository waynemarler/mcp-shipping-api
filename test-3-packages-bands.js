const crypto = require('crypto');
const https = require('https');

// Use your production secret
const secret = 'b50fda56906e2da62889be510aad7a9d42d2b537c82363b77fcf373c5da64429';
const publicKey = 'pc4y_pub_prod';

// Test cases for different girth bands with 3 packages each
const tests = [
  {
    name: "3 packages in 301-320cm band",
    expectedPricePerPackage: 68.51,
    items: [
      {
        sku: "PINE-310-1",
        name: "Pine Board 310cm-1",
        length_mm: 1500,  // With padding: 156cm
        width_mm: 600,    // With padding: 66cm
        thickness_mm: 80, // With padding: 14cm = 310cm girth
        weight_kg: 18,
        qty: 1
      },
      {
        sku: "PINE-310-2",
        name: "Pine Board 310cm-2",
        length_mm: 1480,
        width_mm: 590,
        thickness_mm: 75,
        weight_kg: 17,
        qty: 1
      },
      {
        sku: "PINE-310-3",
        name: "Pine Board 310cm-3",
        length_mm: 1520,
        width_mm: 610,
        thickness_mm: 85,
        weight_kg: 19,
        qty: 1
      }
    ]
  },
  {
    name: "3 packages in 321-360cm band",
    expectedPricePerPackage: 74.76,
    items: [
      {
        sku: "PINE-340-1",
        name: "Pine Board 340cm-1",
        length_mm: 1700,
        width_mm: 650,
        thickness_mm: 110,
        weight_kg: 21,
        qty: 1
      },
      {
        sku: "PINE-340-2",
        name: "Pine Board 340cm-2",
        length_mm: 1680,
        width_mm: 640,
        thickness_mm: 105,
        weight_kg: 20,
        qty: 1
      },
      {
        sku: "PINE-340-3",
        name: "Pine Board 340cm-3",
        length_mm: 1720,
        width_mm: 660,
        thickness_mm: 115,
        weight_kg: 22,
        qty: 1
      }
    ]
  },
  {
    name: "3 packages in >360cm band",
    expectedPricePerPackage: 89.67,
    items: [
      {
        sku: "PINE-380-1",
        name: "Pine Board 380cm-1",
        length_mm: 2000,
        width_mm: 700,
        thickness_mm: 110,
        weight_kg: 24,
        qty: 1
      },
      {
        sku: "PINE-380-2",
        name: "Pine Board 380cm-2",
        length_mm: 2100,
        width_mm: 750,
        thickness_mm: 120,
        weight_kg: 26,
        qty: 1
      },
      {
        sku: "PINE-380-3",
        name: "Pine Board 380cm-3",
        length_mm: 2200,
        width_mm: 800,
        thickness_mm: 130,
        weight_kg: 28,
        qty: 1
      }
    ]
  }
];

async function testPricingBand(testCase) {
  const testData = {
    cartId: `test-3pkg-${testCase.name}`,
    destination: {
      country: "GB",
      postalCode: "HP19",
      city: "Aylesbury"
    },
    items: testCase.items
  };

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

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function runAllTests() {
  console.log('Testing 3 packages in each girth band:\n');
  console.log('Expected pricing:');
  console.log('  301-320cm: £68.51 per package');
  console.log('  321-360cm: £74.76 per package');
  console.log('  >360cm:    £89.67 per package\n');
  console.log('=' .repeat(60) + '\n');

  for (const test of tests) {
    console.log(`Testing: ${test.name}`);
    const totalWeight = test.items.reduce((sum, item) => sum + item.weight_kg, 0);
    console.log(`Total weight: ${totalWeight}kg`);
    console.log(`Expected: £${test.expectedPricePerPackage} x 3 = £${(test.expectedPricePerPackage * 3).toFixed(2)}`);
    
    try {
      const response = await testPricingBand(test);
      
      if (response.detailedPackages) {
        console.log(`\nResult: ${response.detailedPackages.length} packages`);
        
        let totalPrice = 0;
        response.detailedPackages.forEach((pkg, i) => {
          console.log(`  Package ${i + 1}: ${pkg.service} - £${pkg.price} (${pkg.totalWeight}, ${pkg.dimensions})`);
          totalPrice += pkg.price;
        });
        
        console.log(`Total: £${totalPrice}`);
        
        if (response.packages) {
          const weights = response.packages.map(p => p.weight_kg);
          const girths = response.packages.map(p => p.girth_mm / 10);
          const variance = Math.max(...weights) - Math.min(...weights);
          console.log(`Weight distribution: ${weights.map(w => w + 'kg').join(', ')} (variance: ${variance.toFixed(1)}kg)`);
          console.log(`Girths: ${girths.map(g => g + 'cm').join(', ')}`);
        }
        
        const expectedTotal = test.expectedPricePerPackage * response.detailedPackages.length;
        if (Math.abs(totalPrice - expectedTotal) < 1) {
          console.log('✅ Price matches expected!\n');
        } else {
          console.log(`❌ Price mismatch! Expected £${expectedTotal}, got £${totalPrice}\n`);
        }
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}\n`);
    }
    
    console.log('-'.repeat(60) + '\n');
    
    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  
  console.log('All tests completed!');
}

runAllTests();