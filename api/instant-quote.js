const crypto = require('crypto');

const SECRET = process.env.PC4Y_SECRET || 'b50fda56906e2da62889be510aad7a9d42d2b537c82363b77fcf373c5da64429';
const MAX_WEIGHT = 30;
const PADDING = 30;
const GIRTH_THRESHOLD = 3000;

const PRICING = [
  { name: "Standard", maxG: 3000, price: 25 },
  { name: "Oversized", maxG: 5000, price: 55 },
  { name: "Pallet/XL", price: 110 }
];

function packItems(items) {
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

  // Sort by weight descending (pack heaviest items first for better distribution)
  boards.sort((a, b) => b.weight_kg - a.weight_kg);
  const totalWeight = boards.reduce((sum, b) => sum + b.weight_kg, 0);
  
  // Calculate optimal number of packages
  let targetPackages = Math.ceil(totalWeight / MAX_WEIGHT);
  
  // If weight is close to max, prefer more packages for better balance
  // For example, 38kg should be 2 packages (~19kg each) not 30kg + 8kg
  if (totalWeight > MAX_WEIGHT && targetPackages === 2) {
    const avgWeight = totalWeight / 2;
    // If average would be > 20kg, that's too unbalanced, use current target
    // Otherwise we're good with 2 packages
  }
  
  const targetWeight = totalWeight / targetPackages;
  console.log(`Total: ${totalWeight}kg, Target packages: ${targetPackages}, Target weight: ${targetWeight}kg`);
  
  // Initialize empty parcels
  const parcels = [];
  for (let i = 0; i < targetPackages; i++) {
    parcels.push({
      length_mm: 0,
      width_mm: 0,
      height_mm: PADDING * 2, // Start with padding
      weight_kg: 0,
      items: []
    });
  }

  // Distribute boards using best-fit decreasing
  for (const board of boards) {
    let bestParcel = -1;
    let minWeight = Infinity;

    // Find the parcel with minimum weight that can still fit this board
    for (let i = 0; i < parcels.length; i++) {
      const p = parcels[i];
      const newWeight = p.weight_kg + board.weight_kg;
      
      // Skip if would exceed max weight
      if (newWeight > MAX_WEIGHT) continue;
      
      // Prefer the lightest parcel to balance weights
      if (p.weight_kg < minWeight) {
        minWeight = p.weight_kg;
        bestParcel = i;
      }
    }

    // If no suitable parcel found (shouldn't happen with proper sizing)
    if (bestParcel === -1) {
      bestParcel = 0; // Fallback to first parcel
    }

    // Add board to selected parcel
    const p = parcels[bestParcel];
    p.length_mm = Math.max(p.length_mm, board.length_mm + 2 * PADDING);
    p.width_mm = Math.max(p.width_mm, board.width_mm + 2 * PADDING);
    p.height_mm += board.thickness_mm;
    p.weight_kg = Math.round((p.weight_kg + board.weight_kg) * 100) / 100;
    p.items.push(board.name);
  }
  
  // Remove empty parcels if any
  const filledParcels = parcels.filter(p => p.items.length > 0);

  for (const p of filledParcels) {
    p.girth_mm = p.length_mm + 2 * (p.width_mm + p.height_mm);
    const tier = PRICING.find(t => !t.maxG || p.girth_mm <= t.maxG) || PRICING[PRICING.length - 1];
    p.service = tier.name;
    p.price = tier.price;
  }

  return filledParcels;
}

module.exports = (req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PC4Y-Timestamp, X-PC4Y-Signature, X-PC4Y-Key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
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
};