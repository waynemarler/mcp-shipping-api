const crypto = require('crypto');
const https = require('https');

// Use your production secret
const secret = 'b50fda56906e2da62889be510aad7a9d42d2b537c82363b77fcf373c5da64429';
const publicKey = 'pc4y_pub_prod';

// Test case: Mixed sizes with Parcelforce now included
const testData = {
  cartId: "test-mixed-with-parcelforce",
  destination: {
    country: "GB",
    postalCode: "HP19",
    city: "Aylesbury"
  },
  items: [
    {
      sku: "PINE-SMALL-240",
      name: "Small Pine Board 240cm",
      length_mm: 1000,  // 100cm
      width_mm: 440,    // 44cm
      thickness_mm: 60, // 6cm
      weight_kg: 12,
      qty: 1
    },
    {
      sku: "PINE-LARGE-380",
      name: "Large Pine Board 380cm",
      length_mm: 1800,  // 180cm
      width_mm: 700,    // 70cm  
      thickness_mm: 100, // 10cm
      weight_kg: 28,
      qty: 1
    }
  ]
};

// Calculate expected girths with padding
const girth1 = (100 + 6) + 2 * ((44 + 6) + (6 + 6)); // 106 + 2*(50 + 12) = 230cm
const girth2 = (180 + 6) + 2 * ((70 + 6) + (10 + 6)); // 186 + 2*(76 + 16) = 370cm

console.log('Testing mixed packages with Parcelforce enabled:');
console.log('\nPackage 1 (Small):');
console.log('  Dimensions: 100cm x 44cm x 6cm, 12kg');
console.log('  With padding: 106cm x 50cm x 12cm');
console.log('  Girth: ' + girth1 + 'cm (< 300cm threshold)');

console.log('\nPackage 2 (Large):');
console.log('  Dimensions: 180cm x 70cm x 10cm, 28kg');
console.log('  With padding: 186cm x 76cm x 16cm');
console.log('  Girth: ' + girth2 + 'cm (> 300cm threshold)');

console.log('\nTotal weight: 40kg');
console.log('\nExpected behavior:');
console.log('- Now that Parcelforce is preferred, might get P2G quotes');
console.log('- Or still fall back to DHL static if no preferred couriers');
console.log('- 10% multi-package discount should apply');
console.log('- Test if Parcelforce can handle mixed shipment\n');

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

console.log('Testing MCP API with mixed sizes + Parcelforce...\n');

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
      
      console.log('\n=== ANALYSIS ===');
      if (response.source === 'Parcel2Go') {
        const services = response.packages.map(p => p.service).join(', ');
        if (services.includes('Parcelforce')) {
          console.log('✅ Parcelforce option available via P2G');
        } else if (services.includes('UPS')) {
          console.log('✅ UPS option via P2G (preferred for small packages)');
        } else if (services.includes('DHL')) {
          console.log('✅ DHL option via P2G');
        } else {
          console.log('ℹ️  P2G returned other preferred courier');
        }
      } else {
        console.log('ℹ️  Using static DHL pricing (P2G couldn\'t handle mixed sizes)');
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