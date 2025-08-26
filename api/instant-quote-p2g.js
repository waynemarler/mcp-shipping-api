const crypto = require('crypto');
const { getShippingQuotes } = require('../parcel2go-integration');

const SECRET = process.env.PC4Y_SECRET || 'b50fda56906e2da62889be510aad7a9d42d2b537c82363b77fcf373c5da64429';
const MAX_WEIGHT = 30;
const PADDING = 30;

// Fallback static pricing if P2G fails
const STATIC_PRICING = [
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
  }

  return filledParcels;
}

// Get static pricing fallback
function getStaticPricing(parcels) {
  for (const p of parcels) {
    const tier = STATIC_PRICING.find(t => !t.maxG || p.girth_mm <= t.maxG) || STATIC_PRICING[STATIC_PRICING.length - 1];
    p.service = tier.name;
    p.price = tier.price;
  }
  return parcels;
}

module.exports = async (req, res) => {
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
    const destination = req.body.destination || {};
    
    let useP2G = process.env.P2G_CLIENT_ID && process.env.P2G_CLIENT_SECRET;
    let p2gQuotes = null;
    
    // Try to get Parcel2Go quotes if credentials are set
    if (useP2G) {
      try {
        console.log('Fetching Parcel2Go quotes...');
        p2gQuotes = await getShippingQuotes(parcels, destination);
        console.log('P2G Response:', JSON.stringify(p2gQuotes, null, 2));
        
        // Process P2G quotes to find best options
        for (let i = 0; i < parcels.length; i++) {
          const p = parcels[i];
          const quoteResult = p2gQuotes[i];
          
          if (quoteResult && quoteResult.quotes) {
            // Check if we have valid quotes
            if (Array.isArray(quoteResult.quotes) && quoteResult.quotes.length > 0) {
              // Find cheapest quote
              const cheapest = quoteResult.quotes.reduce((min, q) => 
                (!min || q.TotalPrice < min.TotalPrice) ? q : min, null);
              
              if (cheapest) {
                p.service = cheapest.ServiceName || 'P2G Service';
                p.price = Math.ceil(cheapest.TotalPrice);
                p.p2g_quotes = quoteResult.quotes.slice(0, 3); // Keep top 3 options
              }
            } else if (quoteResult.error) {
              console.error('P2G quote error for package:', quoteResult.error);
              // Fall back to static pricing for this package
              const tier = STATIC_PRICING.find(t => !t.maxG || p.girth_mm <= t.maxG) || STATIC_PRICING[STATIC_PRICING.length - 1];
              p.service = tier.name;
              p.price = tier.price;
            }
          }
        }
      } catch (error) {
        console.error('P2G quote error:', error);
        useP2G = false;
      }
    }
    
    // Use static pricing if P2G failed or not configured
    if (!useP2G) {
      getStaticPricing(parcels);
    }
    
    const total = parcels.reduce((sum, p) => sum + p.price, 0);
    const breakdown = parcels.map(p => ({ service: p.service, price: p.price }));

    // Create detailed package descriptions
    const detailedPackages = parcels.map((p, index) => {
      const itemList = [];
      p.items.forEach(itemName => {
        const matchedItem = req.body.items.find(item => item.name === itemName);
        if (matchedItem) {
          const weight = Math.round(matchedItem.weight_kg * 10) / 10;
          itemList.push(`${matchedItem.thickness_mm}mm Pine Cut To Size (${matchedItem.length_mm} x ${matchedItem.width_mm} x ${matchedItem.thickness_mm}) - ${weight} kg`);
        }
      });

      const totalWeight = Math.round(p.weight_kg);
      const lengthCm = Math.round(p.length_mm / 10);
      const widthCm = Math.round(p.width_mm / 10);  
      const heightCm = Math.round(p.height_mm / 10);

      const details = {
        packageNumber: index + 1,
        items: itemList,
        totalWeight: `${totalWeight} kg`,
        dimensions: `${lengthCm} x ${widthCm} x ${heightCm} cm`,
        service: p.service,
        price: p.price
      };
      
      // Include P2G quote options if available
      if (p.p2g_quotes) {
        details.alternativeServices = p.p2g_quotes.map(q => ({
          service: q.ServiceName,
          price: Math.ceil(q.TotalPrice),
          deliveryDays: q.EstimatedDeliveryDays
        }));
      }
      
      return details;
    });

    res.json({
      status: "done",
      total,
      currency: "GBP",
      packages: parcels,
      detailedPackages,
      breakdown,
      source: useP2G ? 'Parcel2Go' : 'Static',
      copy: useP2G ? 
        "Live shipping rates from Parcel2Go carriers." : 
        "We've checked the best and cheapest option for your order."
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};