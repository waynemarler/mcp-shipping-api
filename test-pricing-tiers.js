const crypto = require('crypto');
const https = require('https');

// Use your production secret
const secret = 'b50fda56906e2da62889be510aad7a9d42d2b537c82363b77fcf373c5da64429';
const publicKey = 'pc4y_pub_prod';

// Test different pricing tiers
const tests = [
  {
    name: "310cm girth (301-320cm tier)",
    items: [{
      sku: "TEST-310",
      name: "Test Board 310cm",
      length_mm: 1500,  // With 30mm padding: 156cm
      width_mm: 600,    // With 30mm padding: 66cm
      thickness_mm: 80, // With 30mm padding: 14cm = 310cm girth
      weight_kg: 20,
      qty: 1
    }],
    expectedPrice: 68.51
  },
  {
    name: "340cm girth (321-360cm tier)",
    items: [{
      sku: "TEST-340",
      name: "Test Board 340cm",
      length_mm: 1700,  // With 30mm padding: 176cm
      width_mm: 650,    // With 30mm padding: 71cm
      thickness_mm: 110, // With 30mm padding: 17cm = 340cm girth
      weight_kg: 22,
      qty: 1
    }],
    expectedPrice: 74.76
  },
  {
    name: "380cm girth (>360cm tier)",
    items: [{
      sku: "TEST-380",
      name: "Test Board 380cm",
      length_mm: 2000,  // With 30mm padding: 206cm
      width_mm: 700,    // With 30mm padding: 76cm
      thickness_mm: 110, // With 30mm padding: 17cm = 380cm girth
      weight_kg: 25,
      qty: 1
    }],
    expectedPrice: 89.67
  }
];

async function testPricingTier(testCase) {
  const testData = {
    cartId: `test-${testCase.name}`,
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
  console.log('Testing refined pricing tiers:\n');
  console.log('Pricing structure:');
  console.log('  301-320cm: £68.51');
  console.log('  321-360cm: £74.76');
  console.log('  >360cm:    £89.67\n');
  console.log('=' .repeat(50) + '\n');

  for (const test of tests) {
    console.log(`Testing: ${test.name}`);
    console.log(`Expected price: £${test.expectedPrice}`);
    
    try {
      const response = await testPricingTier(test);
      
      if (response.detailedPackages && response.detailedPackages[0]) {
        const pkg = response.detailedPackages[0];
        const actualPrice = pkg.price;
        const service = pkg.service;
        const dimensions = pkg.dimensions;
        
        console.log(`Result: ${service} - £${actualPrice} (${dimensions})`);
        
        if (actualPrice == test.expectedPrice) {
          console.log('✅ Price matches expected!\n');
        } else {
          console.log(`❌ Price mismatch! Expected £${test.expectedPrice}, got £${actualPrice}\n`);
        }
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}\n`);
    }
    
    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

runAllTests();