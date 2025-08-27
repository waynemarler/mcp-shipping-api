const crypto = require('crypto');
const { getShippingQuotes } = require('../parcel2go-integration');

const SECRET = process.env.PC4Y_SECRET || 'b50fda56906e2da62889be510aad7a9d42d2b537c82363b77fcf373c5da64429';
const MAX_WEIGHT = 30;
const PADDING = 30;

// Fallback static pricing if P2G fails (refined oversized rates)
const STATIC_PRICING = [
  { name: "Standard", maxG: 3000, price: 25 },                    // Up to 300cm girth (P2G usually handles these)
  { name: "DHL Express Medium", maxG: 3200, price: 68.51 },       // 301-320cm girth
  { name: "DHL Express Large", maxG: 3600, price: 74.76 },        // 321-360cm girth
  { name: "DHL Express XL", price: 89.67 }                        // Over 360cm girth
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
        
        // Process P2G quotes - now a single response for all packages
        const quotes = p2gQuotes.Quotes || p2gQuotes.quotes;
        if (quotes && Array.isArray(quotes) && quotes.length > 0) {
          console.log(`P2G returned ${quotes.length} quotes for ${parcels.length} packages`);
          
          // Define preferred couriers (only UPS and DHL)
          const preferredCouriers = ['ups', 'dhl'];
          
          // Filter to only keep collection services from preferred couriers
          const collectionOnly = quotes.filter(q => {
            const courierName = q.Service?.CourierName?.toLowerCase() || '';
            const serviceName = q.Service?.Name?.toLowerCase() || '';
            
            // Must be collection service
            if (q.Service?.CollectionType !== 'Collection') return false;
            
            // Check if it's from a preferred courier (UPS or DHL only)
            const isPreferred = preferredCouriers.some(courier => 
              courierName.includes(courier) || serviceName.includes(courier)
            );
            
            return isPreferred;
          });
          
          console.log(`Found ${collectionOnly.length} UPS/DHL collection services out of ${quotes.length} total`);
          
          // Only use UPS/DHL quotes if available, otherwise use static pricing
          const quotesToUse = collectionOnly;
          
          // Check maximum girth across all packages
          const maxGirth = Math.max(...parcels.map(p => p.girth_mm / 10)); // Convert to cm
          console.log(`Max package girth: ${maxGirth}cm`);
          
          let selectedQuote;
          
          if (maxGirth <= 300) {
            // For packages ≤300cm girth, prefer UPS Standard
            const upsStandard = quotesToUse.find(q => 
              q.Service?.CourierSlug === 'ups' && 
              q.Service?.Slug === 'ups-dap-uk-standard'
            );
            
            if (upsStandard) {
              selectedQuote = upsStandard;
              console.log('Selected UPS Standard (preferred for girth ≤300cm)');
            }
          } else {
            // For packages >300cm girth, prefer DHL Express
            const dhlExpress = quotesToUse.find(q => 
              q.Service?.CourierSlug === 'dhl' || 
              q.Service?.CourierName === 'DHL'
            );
            
            if (dhlExpress) {
              selectedQuote = dhlExpress;
              console.log('Selected DHL Express (preferred for girth >300cm)');
            }
          }
          
          // If preferred courier not found and we have no UPS/DHL quotes, fall back to static
          if (!selectedQuote && quotesToUse.length === 0) {
            console.log('No UPS/DHL quotes available, using static pricing');
            // Fall back to static pricing
            for (let i = 0; i < parcels.length; i++) {
              const p = parcels[i];
              const girthCm = p.girth_mm / 10;
              const tier = STATIC_PRICING.find(t => !t.maxG || p.girth_mm <= t.maxG) || STATIC_PRICING[STATIC_PRICING.length - 1];
              p.service = tier.name;
              p.price = tier.price;
              console.log(`Package ${i + 1}: Static pricing - ${tier.name} - £${tier.price} (girth: ${girthCm}cm)`);
            }
            // Skip the rest of the P2G processing
            selectedQuote = null;
          } else if (!selectedQuote && quotesToUse.length > 0) {
            // We have UPS/DHL quotes but not the preferred one, use cheapest UPS/DHL
            selectedQuote = quotesToUse.reduce((min, q) => 
              (!min || q.TotalPrice < min.TotalPrice) ? q : min, null);
            console.log('Preferred specific service not available, using cheapest UPS/DHL option');
          }
          
          const cheapest = selectedQuote;
          
          if (cheapest) {
            console.log(`Best quote: ${cheapest.Service?.Name} - £${cheapest.TotalPrice} (${cheapest.Service?.CollectionType})`);
            
            // Calculate price per package (split total cost)
            const pricePerPackage = Math.ceil(cheapest.TotalPrice / parcels.length);
            
            // Apply same service and split price to all packages
            for (let i = 0; i < parcels.length; i++) {
              const p = parcels[i];
              p.service = cheapest.Service?.Name || 'P2G Service';
              p.price = pricePerPackage;
              p.p2g_quotes = quotesToUse.slice(0, 5); // Keep top 5 collection options
              console.log(`Package ${i + 1}: ${p.service} - £${p.price}`);
            }
          }
        } else if (p2gQuotes.error) {
          console.error('P2G quote error:', p2gQuotes.error);
          // Fall back to static pricing for all packages
          for (let i = 0; i < parcels.length; i++) {
            const p = parcels[i];
            const tier = STATIC_PRICING.find(t => !t.maxG || p.girth_mm <= t.maxG) || STATIC_PRICING[STATIC_PRICING.length - 1];
            p.service = tier.name;
            p.price = tier.price;
          }
        } else {
          console.log('No quotes found - falling back to static pricing');
          // Fall back to static pricing for all packages  
          for (let i = 0; i < parcels.length; i++) {
            const p = parcels[i];
            const girthCm = p.girth_mm / 10;
            const tier = STATIC_PRICING.find(t => !t.maxG || p.girth_mm <= t.maxG) || STATIC_PRICING[STATIC_PRICING.length - 1];
            p.service = tier.name;
            p.price = tier.price;
            console.log(`Package ${i + 1}: Static pricing - ${tier.name} - £${tier.price} (girth: ${girthCm}cm)`);
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
          service: q.Service?.Name || q.ServiceName,
          courier: q.Service?.CourierName,
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