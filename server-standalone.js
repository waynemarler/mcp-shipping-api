const express = require('express');
const crypto = require('crypto');
const app = express();

// Configuration
const SECRET = process.env.PC4Y_SECRET || 'b50fda56906e2da62889be510aad7a9d42d2b537c82363b77fcf373c5da64429';
const MAX_WEIGHT = 30; // 30kg max per package
const GIRTH_THRESHOLD = 3000; // 300cm in mm
const PADDING = 20; // 20mm padding

const PRICING = [
  { name: "Standard", maxG: 3000, price: 25 },
  { name: "Oversized", maxG: 5000, price: 55 },
  { name: "Pallet/XL", price: 110 }
];

// HMAC authentication
function hmacOk(ts, body, sig) {
  const raw = JSON.stringify(body || {});
  const mac = crypto.createHmac("sha256", SECRET).update(ts + "." + raw).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(sig));
}

// Smart packing algorithm
function packItems(items) {
  // Expand quantities
  const boards = [];
  for (const item of items) {
    const qty = item.qty || 1;
    for (let i = 0; i < qty; i++) {
      boards.push({
        name: item.name,
        length_mm: item.length_mm,
        width_mm: item.width_mm,
        thickness_mm: item.thickness_mm,
        weight_kg: item.weight_kg || 0
      });
    }
  }

  // Sort by size (largest first)
  boards.sort((a, b) => b.length_mm - a.length_mm || b.width_mm - a.width_mm);

  const totalWeight = boards.reduce((sum, b) => sum + b.weight_kg, 0);
  console.log(`Total weight: ${totalWeight}kg, Boards: ${boards.length}`);

  // Determine target packages for balanced weight
  let targetPackages = Math.ceil(totalWeight / MAX_WEIGHT);
  if (totalWeight > MAX_WEIGHT && targetPackages === 1) {
    targetPackages = 2; // Force split for better balance
  }

  const targetWeight = totalWeight / targetPackages;
  console.log(`Target: ${targetPackages} packages, ~${targetWeight.toFixed(1)}kg each`);

  const parcels = [];

  // Smart distribution
  for (const board of boards) {
    let bestParcel = -1;
    let bestScore = Infinity;

    // Try existing parcels
    for (let i = 0; i < parcels.length; i++) {
      const p = parcels[i];
      const newWeight = p.weight_kg + board.weight_kg;
      
      if (newWeight > MAX_WEIGHT) continue;

      // Score: closer to target weight is better
      const score = Math.abs(newWeight - targetWeight);
      if (score < bestScore) {
        bestScore = score;
        bestParcel = i;
      }
    }

    if (bestParcel >= 0) {
      // Add to existing parcel
      const p = parcels[bestParcel];
      p.length_mm = Math.max(p.length_mm, board.length_mm + 2 * PADDING);
      p.width_mm = Math.max(p.width_mm, board.width_mm + 2 * PADDING);
      p.height_mm += board.thickness_mm;
      p.weight_kg = Math.round((p.weight_kg + board.weight_kg) * 100) / 100;
      p.items.push(board.name);
    } else {
      // Create new parcel
      parcels.push({
        length_mm: board.length_mm + 2 * PADDING,
        width_mm: board.width_mm + 2 * PADDING,
        height_mm: board.thickness_mm + 2 * PADDING,
        weight_kg: board.weight_kg,
        items: [board.name]
      });
    }
  }

  // Calculate girth and pricing
  for (const p of parcels) {
    p.girth_mm = p.length_mm + 2 * (p.width_mm + p.height_mm);
    
    // Find pricing tier
    const tier = PRICING.find(t => !t.maxG || p.girth_mm <= t.maxG) || PRICING[PRICING.length - 1];
    p.service = tier.name;
    p.price = tier.price;
  }

  console.log('Packed into', parcels.length, 'parcels:');
  parcels.forEach((p, i) => {
    console.log(`  ${i+1}: ${p.weight_kg}kg, girth: ${(p.girth_mm/10).toFixed(0)}cm, ${p.service}`);
  });

  return parcels;
}

// Express middleware
app.use(express.json());

// Routes
app.get('/health', (req, res) => {
  res.json({ 
    ok: true,
    timestamp: new Date().toISOString(),
    environment: 'production',
    version: '1.2.0-standalone',
    smartPacking: true
  });
});

app.get('/', (req, res) => {
  res.json({
    service: 'PineCut4You MCP Shipping API',
    version: '1.2.0-standalone',
    features: 'Smart weight distribution + girth-based pricing',
    endpoints: ['GET /health', 'POST /instant-quote']
  });
});

app.post('/instant-quote', (req, res) => {
  const ts = req.header("X-PC4Y-Timestamp") || "";
  const sig = req.header("X-PC4Y-Signature") || "";
  
  if (process.env.NODE_ENV === 'production' && !hmacOk(ts, req.body, sig)) {
    return res.status(401).json({ error: "bad signature" });
  }

  try {
    const parcels = packItems(req.body.items || []);
    const total = parcels.reduce((sum, p) => sum + p.price, 0);
    const breakdown = parcels.map(p => ({ service: p.service, price: p.price }));

    res.json({
      status: "done",
      total,
      currency: "GBP",
      packages: parcels,
      breakdown,
      copy: "We've checked the best and cheapest option for your order."
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`🚀 Standalone MCP API running on port ${PORT}`);
  console.log(`Smart packing: ON, Max weight: ${MAX_WEIGHT}kg`);
});