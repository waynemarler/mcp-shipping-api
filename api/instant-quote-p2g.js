const crypto = require("crypto");
const { getShippingQuotes } = require("../parcel2go-integration");

const SECRET =
  process.env.PC4Y_SECRET ||
  "b50fda56906e2da62889be510aad7a9d42d2b537c82363b77fcf373c5da64429";
const MAX_WEIGHT = 30; // Max weight for UPS/Parcelforce via P2G
const DHL_MAX_WEIGHT = 45; // Max weight for DHL static pricing
const PADDING = 30;

// Fallback static pricing if P2G fails (DHL Express tiers only)
const STATIC_PRICING = [
  { name: "DHL Express Medium", maxG: 3800, price: 73.51 }, // Up to 380cm girth
  { name: "DHL Express Large", maxG: 4200, price: 79.76 }, // 381-420cm girth
  { name: "DHL Express XL", maxG: 5000, price: 94.67 }, // 421-500cm girth
  { name: "DHL Express XXL", price: 109.56 }, // Over 500cm girth
];

function packItems(items) {
  // Separate T&G boards from other items
  const tgBoards = [];
  const regularBoards = [];

  for (const item of items) {
    const qty = item.qty || 1;

    // Check if this is a T&G board that should be kept together
    if (item.keep_together || item.product_type === "T&G_BOARDS") {
      // Keep T&G boards as a single unit (don't expand quantity)
      tgBoards.push({
        name: item.name,
        length_mm: item.length_mm,
        width_mm: item.width_mm,
        thickness_mm: item.thickness_mm,
        weight_kg: item.weight_kg || 0,
        quantity: qty, // Keep track of quantity
        keep_together: true,
      });
      console.log(`🔗 KEEP_TOGETHER detected: ${item.name}`);
      console.log(`   └── SKU: ${item.sku}, Qty: ${qty} boards`);
      console.log(
        `   └── Individual board: ${item.length_mm}×${item.width_mm}×${item.thickness_mm}mm, ${item.weight_kg}kg each`
      );
      console.log(
        `   └── Total weight: ${(item.weight_kg * qty).toFixed(2)}kg`
      );
    } else {
      // Regular items - expand quantity as before
      for (let i = 0; i < qty; i++) {
        regularBoards.push({
          name: item.name,
          length_mm: item.length_mm,
          width_mm: item.width_mm,
          thickness_mm: item.thickness_mm,
          weight_kg: item.weight_kg || 0,
        });
      }
    }
  }

  // Process T&G boards first (as complete bundles)
  const parcels = [];

  // Pack T&G boards into their own packages
  for (const tgBundle of tgBoards) {
    const bundleWeight = tgBundle.weight_kg * tgBundle.quantity;

    // Calculate dimensions for the bundle (stacked boards like tester shows)
    // For 45 boards at 90mm wide × 9mm thick:
    // Stack them: 45 boards × 9mm = 405mm height
    const bundleLength = tgBundle.length_mm + 2 * PADDING;
    const bundleWidth = tgBundle.width_mm + 2 * PADDING; // Single board width (90mm)
    const bundleHeight =
      tgBundle.thickness_mm * tgBundle.quantity + 2 * PADDING; // Stack all boards vertically

    console.log(
      `📦 T&G Bundle Packaging: ${tgBundle.quantity} boards, ${bundleWeight}kg total`
    );
    console.log(
      `   └── Bundle dimensions: ${bundleLength}×${bundleWidth}×${bundleHeight}mm`
    );
    console.log(
      `   └── Bundle girth: ${Math.round((bundleLength + 2 * (bundleWidth + bundleHeight)) / 10)}cm`
    );

    // Create packages for T&G bundles (split if over weight limit)
    if (bundleWeight <= MAX_WEIGHT) {
      // Single package for all T&G boards
      parcels.push({
        length_mm: bundleLength,
        width_mm: bundleWidth,
        height_mm: bundleHeight,
        weight_kg: Math.round(bundleWeight * 100) / 100,
        items: [`${tgBundle.name} x${tgBundle.quantity}`],
        is_tg_bundle: true,
      });
      console.log(
        `   ✅ Single T&G package created: ${bundleWeight}kg ≤ ${MAX_WEIGHT}kg limit`
      );
    } else {
      // Split into multiple packages if too heavy
      const packagesNeeded = Math.ceil(bundleWeight / MAX_WEIGHT);
      const boardsPerPackage = Math.ceil(tgBundle.quantity / packagesNeeded);
      console.log(
        `   ⚠️ T&G bundle too heavy (${bundleWeight}kg > ${MAX_WEIGHT}kg), splitting into ${packagesNeeded} packages`
      );

      for (let i = 0; i < packagesNeeded; i++) {
        const boardsInPackage = Math.min(
          boardsPerPackage,
          tgBundle.quantity - i * boardsPerPackage
        );
        const packageWeight = tgBundle.weight_kg * boardsInPackage;
        const packageHeight =
          tgBundle.thickness_mm * boardsInPackage + 2 * PADDING;

        parcels.push({
          length_mm: bundleLength,
          width_mm: tgBundle.width_mm + 2 * PADDING, // Single board width
          height_mm: packageHeight, // Stack height
          weight_kg: Math.round(packageWeight * 100) / 100,
          items: [`${tgBundle.name} x${boardsInPackage}`],
          is_tg_bundle: true,
        });

        console.log(
          `   └── T&G Package ${i + 1}/${packagesNeeded}: ${boardsInPackage} boards, ${packageWeight.toFixed(2)}kg`
        );
        console.log(
          `       Dimensions: ${bundleLength}×${tgBundle.width_mm + 2 * PADDING}×${packageHeight}mm`
        );
      }
    }
  }

  // Now handle regular boards with GIRTH-FIRST strategy
  const boards = regularBoards;

  if (boards.length > 0) {
    console.log(
      `🎯 GIRTH-FIRST PACKAGING: ${boards.length} regular boards to process`
    );

    // Sort boards by dimensions (smaller boards first for better UPS packing)
    boards.sort((a, b) => {
      const aSize = a.length_mm * a.width_mm * a.thickness_mm;
      const bSize = b.length_mm * b.width_mm * b.thickness_mm;
      return aSize - bSize;
    });

    const upsBoards = [];
    const dhlBoards = [];

    // PHASE 1: Create UPS packages (≤300cm girth, ≤30kg weight)
    console.log(`📦 PHASE 1: Creating UPS packages (≤300cm, ≤30kg)`);

    for (const board of boards) {
      let addedToUPS = false;

      // Try to fit this board into existing UPS packages
      for (let i = parcels.length - 1; i >= 0; i--) {
        const p = parcels[i];

        // Skip T&G bundles and DHL packages
        if (p.is_tg_bundle || p.is_dhl_oversized) continue;

        // Calculate new dimensions if we add this board
        const newLength = Math.max(p.length_mm, board.length_mm + 2 * PADDING);
        const newWidth = Math.max(p.width_mm, board.width_mm + 2 * PADDING);
        const newHeight = p.height_mm + board.thickness_mm;
        const newWeight = p.weight_kg + board.weight_kg;
        const newGirth = newLength + 2 * (newWidth + newHeight);

        // Check if it fits UPS constraints
        if (newGirth <= 3000 && newWeight <= MAX_WEIGHT) {
          // 3000mm = 300cm
          // Add to existing UPS package
          p.length_mm = newLength;
          p.width_mm = newWidth;
          p.height_mm = newHeight;
          p.weight_kg = Math.round(newWeight * 100) / 100;
          p.items.push(board.name);
          addedToUPS = true;
          break;
        }
      }

      // If not added to existing package, try to create new UPS package
      if (!addedToUPS) {
        const packageLength = board.length_mm + 2 * PADDING;
        const packageWidth = board.width_mm + 2 * PADDING;
        const packageHeight = board.thickness_mm + 2 * PADDING;
        const packageGirth = packageLength + 2 * (packageWidth + packageHeight);

        if (packageGirth <= 3000 && board.weight_kg <= MAX_WEIGHT) {
          // Create new UPS package
          parcels.push({
            length_mm: packageLength,
            width_mm: packageWidth,
            height_mm: packageHeight,
            weight_kg: board.weight_kg,
            items: [board.name],
            is_ups_package: true,
          });
          addedToUPS = true;
          console.log(
            `   ✅ New UPS package: ${Math.round(packageGirth / 10)}cm girth, ${board.weight_kg}kg`
          );
        }
      }

      // If couldn't fit in UPS, save for DHL phase
      if (!addedToUPS) {
        dhlBoards.push(board);
      }
    }

    // PHASE 2: Create DHL packages for oversized boards (≤45kg weight)
    if (dhlBoards.length > 0) {
      console.log(
        `📦 PHASE 2: Creating DHL packages for ${dhlBoards.length} oversized boards (≤45kg)`
      );

      for (const board of dhlBoards) {
        let addedToDHL = false;

        // Try to fit into existing DHL packages
        for (let i = parcels.length - 1; i >= 0; i--) {
          const p = parcels[i];

          // Only consider DHL packages
          if (!p.is_dhl_oversized) continue;

          const newWeight = p.weight_kg + board.weight_kg;

          // Check DHL weight constraint
          if (newWeight <= DHL_MAX_WEIGHT) {
            // Add to existing DHL package
            p.length_mm = Math.max(p.length_mm, board.length_mm + 2 * PADDING);
            p.width_mm = Math.max(p.width_mm, board.width_mm + 2 * PADDING);
            p.height_mm += board.thickness_mm;
            p.weight_kg = Math.round(newWeight * 100) / 100;
            p.items.push(board.name);
            addedToDHL = true;
            break;
          }
        }

        // Create new DHL package if needed
        if (!addedToDHL) {
          const packageLength = board.length_mm + 2 * PADDING;
          const packageWidth = board.width_mm + 2 * PADDING;
          const packageHeight = board.thickness_mm + 2 * PADDING;
          const packageGirth =
            packageLength + 2 * (packageWidth + packageHeight);

          parcels.push({
            length_mm: packageLength,
            width_mm: packageWidth,
            height_mm: packageHeight,
            weight_kg: board.weight_kg,
            items: [board.name],
            is_dhl_oversized: true,
          });
          console.log(
            `   ⚠️ New DHL package: ${Math.round(packageGirth / 10)}cm girth, ${board.weight_kg}kg`
          );
        }
      }
    }

    const upsCount = parcels.filter((p) => p.is_ups_package).length;
    const dhlCount = parcels.filter((p) => p.is_dhl_oversized).length;
    const tgCount = parcels.filter((p) => p.is_tg_bundle).length;
    console.log(
      `🎯 PACKAGING COMPLETE: ${upsCount} UPS + ${dhlCount} DHL + ${tgCount} T&G packages`
    );
  }

  // Remove empty parcels if any (but keep T&G bundles even if items array is different)
  const filledParcels = parcels.filter(
    (p) => p.items.length > 0 || p.is_tg_bundle
  );

  for (const p of filledParcels) {
    p.girth_mm = p.length_mm + 2 * (p.width_mm + p.height_mm);
  }

  return filledParcels;
}

// Get static pricing fallback
function getStaticPricing(parcels) {
  for (const p of parcels) {
    if (p.weight_kg > DHL_MAX_WEIGHT) {
      p.service = "OVERWEIGHT";
      p.price = 0;
      p.error = `Package exceeds ${DHL_MAX_WEIGHT}kg DHL limit (${p.weight_kg}kg)`;
    } else {
      const tier =
        STATIC_PRICING.find((t) => !t.maxG || p.girth_mm <= t.maxG) ||
        STATIC_PRICING[STATIC_PRICING.length - 1];
      p.service = tier.name;
      p.price = tier.price;
    }
  }
  return parcels;
}

module.exports = async (req, res) => {
  // Handle CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-PC4Y-Timestamp, X-PC4Y-Signature, X-PC4Y-Key"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const parcels = packItems(req.body.items || []);
    const destination = req.body.destination || {};

    let useP2G = process.env.P2G_CLIENT_ID && process.env.P2G_CLIENT_SECRET;
    let p2gQuotes = null;

    // Check if any packages need P2G quotes (≤300cm girth)
    const smallPackages = parcels.filter((p) => p.girth_mm / 10 <= 300);

    // Try to get Parcel2Go quotes only for small packages
    if (useP2G && smallPackages.length > 0) {
      try {
        console.log(
          `Fetching P2G quotes for ${smallPackages.length} small packages...`
        );
        p2gQuotes = await getShippingQuotes(smallPackages, destination);
        console.log("P2G Response:", JSON.stringify(p2gQuotes, null, 2));

        // Process P2G quotes - now a single response for all packages
        const quotes = p2gQuotes.Quotes || p2gQuotes.quotes;
        if (quotes && Array.isArray(quotes) && quotes.length > 0) {
          console.log(
            `P2G returned ${quotes.length} quotes for ${parcels.length} packages`
          );

          // Define preferred couriers (UPS, Parcelforce, and DHL)
          const preferredCouriers = ["ups", "parcelforce", "dhl"];

          // Filter to only keep collection services from preferred couriers
          const collectionOnly = quotes.filter((q) => {
            const courierName = q.Service?.CourierName?.toLowerCase() || "";
            const serviceName = q.Service?.Name?.toLowerCase() || "";

            // Must be collection service
            if (q.Service?.CollectionType !== "Collection") return false;

            // Check if it's from a preferred courier (UPS or DHL only)
            const isPreferred = preferredCouriers.some(
              (courier) =>
                courierName.includes(courier) || serviceName.includes(courier)
            );

            return isPreferred;
          });

          console.log(
            `Found ${collectionOnly.length} preferred courier collection services out of ${quotes.length} total`
          );

          // Use P2G quote for entire shipment, not per package
          console.log(
            `\nProcessing ${parcels.length} packages with P2G quotes`
          );

          // Find the best UPS quote for entire shipment (any UPS service)
          const upsQuotes = collectionOnly.filter(
            (q) => q.Service?.CourierSlug === "ups"
          );
          const upsStandard =
            upsQuotes.find((q) => q.Service?.Slug === "ups-dap-uk-standard") ||
            upsQuotes[0]; // Use first UPS quote if Standard not available

          // If no UPS, try Parcelforce as backup
          const parcelforceQuotes = collectionOnly.filter(
            (q) => q.Service?.CourierSlug === "parcelforce"
          );
          const parcelforceService = parcelforceQuotes[0]; // Use first Parcelforce quote

          let p2gShipmentTotal = null;
          let p2gService = null;

          if (upsStandard) {
            // UPS available - use it
            p2gShipmentTotal = Math.round(upsStandard.TotalPrice * 100) / 100;
            p2gService = upsStandard;
            console.log(
              `✓ Selected UPS service for entire shipment: ${upsStandard.Service?.Name} - £${p2gShipmentTotal}`
            );
            console.log(`Total UPS options available: ${upsQuotes.length}`);
          } else if (parcelforceService) {
            // No UPS but Parcelforce available - use it
            p2gShipmentTotal =
              Math.round(parcelforceService.TotalPrice * 100) / 100;
            p2gService = parcelforceService;
            console.log(
              `⚠️ No UPS available, using Parcelforce fallback: ${parcelforceService.Service?.Name} - £${p2gShipmentTotal}`
            );
            console.log(
              `Total Parcelforce options available: ${parcelforceQuotes.length}`
            );
          } else {
            // Neither UPS nor Parcelforce available
            console.log(
              "⚠️ No UPS or Parcelforce quotes available from P2G - will use DHL static"
            );
            console.log(
              "Available couriers:",
              [
                ...new Set(collectionOnly.map((q) => q.Service?.CourierName)),
              ].join(", ")
            );
          }

          // Process each package
          for (let i = 0; i < parcels.length; i++) {
            const p = parcels[i];
            const girthCm = p.girth_mm / 10;
            console.log(
              `\n=== Package ${i + 1} (${girthCm}cm girth, ${p.weight_kg}kg) ===`
            );

            if (girthCm <= 300 && p2gShipmentTotal !== null) {
              // Small packages use P2G service (UPS or Parcelforce)
              p.service = p2gService.Service?.Name || "P2G Service";
              p.price = 0; // Will use shipment total instead
              const courierSlug = p2gService.Service?.CourierSlug;
              p.p2g_quotes = collectionOnly
                .filter((q) => q.Service?.CourierSlug === courierSlug)
                .slice(0, 5);
              console.log(
                `Package uses P2G service: ${p.service} (${courierSlug})`
              );
            } else if (girthCm <= 300 && p2gShipmentTotal === null) {
              // No UPS available for small package - use DHL static
              console.log(`No UPS available, using DHL static pricing`);
              if (p.weight_kg > DHL_MAX_WEIGHT) {
                p.service = "OVERWEIGHT";
                p.price = 0;
                p.error = `Package exceeds ${DHL_MAX_WEIGHT}kg DHL limit (${p.weight_kg}kg)`;
                console.log(
                  `⚠️ Package overweight: ${p.weight_kg}kg > ${DHL_MAX_WEIGHT}kg DHL limit`
                );
              } else {
                const tier =
                  STATIC_PRICING.find((t) => !t.maxG || p.girth_mm <= t.maxG) ||
                  STATIC_PRICING[STATIC_PRICING.length - 1];
                p.service = tier.name;
                p.price = tier.price;
                console.log(`DHL static: ${tier.name} - £${tier.price}`);
              }
            } else {
              // Large packages always use DHL static
              console.log(`Large package >300cm, using DHL static pricing`);
              if (p.weight_kg > DHL_MAX_WEIGHT) {
                p.service = "OVERWEIGHT";
                p.price = 0;
                p.error = `Package exceeds ${DHL_MAX_WEIGHT}kg DHL limit (${p.weight_kg}kg)`;
                console.log(
                  `⚠️ Package overweight: ${p.weight_kg}kg > ${DHL_MAX_WEIGHT}kg DHL limit`
                );
              } else {
                const tier =
                  STATIC_PRICING.find((t) => !t.maxG || p.girth_mm <= t.maxG) ||
                  STATIC_PRICING[STATIC_PRICING.length - 1];
                p.service = tier.name;
                p.price = tier.price;
                console.log(`DHL static: ${tier.name} - £${tier.price}`);
              }
            }
          }

          // Store P2G total for final calculation
          if (p2gShipmentTotal !== null) {
            parcels.p2g_shipment_total = p2gShipmentTotal;
          }
        } else if (p2gQuotes.error) {
          console.error("P2G quote error:", p2gQuotes.error);
          // Fall back to static pricing for all packages
          for (let i = 0; i < parcels.length; i++) {
            const p = parcels[i];
            if (p.weight_kg > DHL_MAX_WEIGHT) {
              p.service = "OVERWEIGHT";
              p.price = 0;
              p.error = `Package exceeds ${DHL_MAX_WEIGHT}kg DHL limit (${p.weight_kg}kg)`;
            } else {
              const tier =
                STATIC_PRICING.find((t) => !t.maxG || p.girth_mm <= t.maxG) ||
                STATIC_PRICING[STATIC_PRICING.length - 1];
              p.service = tier.name;
              p.price = tier.price;
            }
          }
        } else {
          console.log("No quotes found - falling back to static pricing");
          // Fall back to static pricing for all packages
          for (let i = 0; i < parcels.length; i++) {
            const p = parcels[i];
            const girthCm = p.girth_mm / 10;
            if (p.weight_kg > DHL_MAX_WEIGHT) {
              p.service = "OVERWEIGHT";
              p.price = 0;
              p.error = `Package exceeds ${DHL_MAX_WEIGHT}kg DHL limit (${p.weight_kg}kg)`;
              console.log(
                `Package ${i + 1}: OVERWEIGHT - ${p.weight_kg}kg exceeds ${DHL_MAX_WEIGHT}kg DHL limit`
              );
            } else {
              const tier =
                STATIC_PRICING.find((t) => !t.maxG || p.girth_mm <= t.maxG) ||
                STATIC_PRICING[STATIC_PRICING.length - 1];
              p.service = tier.name;
              p.price = tier.price;
              console.log(
                `Package ${i + 1}: Static pricing - ${tier.name} - £${tier.price} (girth: ${girthCm}cm)`
              );
            }
          }
        }
      } catch (error) {
        console.error("P2G quote error:", error);
        useP2G = false;
      }
    }

    // Handle large packages (>300cm) that didn't get P2G quotes
    for (let i = 0; i < parcels.length; i++) {
      const p = parcels[i];
      const girthCm = p.girth_mm / 10;

      if (girthCm > 300 && !p.service) {
        console.log(
          `\n=== Large Package ${i + 1} (${girthCm}cm girth, ${p.weight_kg}kg) - DHL Static ===`
        );
        if (p.weight_kg > DHL_MAX_WEIGHT) {
          p.service = "OVERWEIGHT";
          p.price = 0;
          p.error = `Package exceeds ${DHL_MAX_WEIGHT}kg DHL limit (${p.weight_kg}kg)`;
          console.log(
            `⚠️ Package overweight: ${p.weight_kg}kg > ${DHL_MAX_WEIGHT}kg DHL limit`
          );
        } else {
          const tier =
            STATIC_PRICING.find((t) => !t.maxG || p.girth_mm <= t.maxG) ||
            STATIC_PRICING[STATIC_PRICING.length - 1];
          p.service = tier.name;
          p.price = tier.price;
          console.log(`DHL static: ${tier.name} - £${tier.price}`);
        }
      }
    }

    // Use static pricing if P2G failed or not configured
    if (!useP2G) {
      getStaticPricing(parcels);
    }

    // Determine actual source used
    let actualSource = "Static";
    if (useP2G) {
      // Check if any packages actually got P2G quotes (not DHL static)
      const hasP2GQuotes = parcels.some(
        (p) => p.p2g_quotes && p.p2g_quotes.length > 0
      );
      if (hasP2GQuotes) {
        actualSource = "Parcel2Go";
      }
    }

    // Calculate total - use P2G shipment total if available, otherwise sum package prices
    let subtotal;
    let discount = 0;
    let total;

    if (parcels.p2g_shipment_total) {
      // Use P2G total for entire shipment + any DHL static packages
      const dhlStaticTotal = parcels
        .filter((p) => p.price > 0)
        .reduce((sum, p) => sum + p.price, 0);
      subtotal =
        Math.round((parcels.p2g_shipment_total + dhlStaticTotal) * 100) / 100;
      total = subtotal;
      console.log(
        `Using P2G shipment total: £${parcels.p2g_shipment_total} + DHL static: £${dhlStaticTotal} = £${subtotal}`
      );
    } else {
      // Traditional calculation for all static pricing
      subtotal =
        Math.round(parcels.reduce((sum, p) => sum + p.price, 0) * 100) / 100;
      total = subtotal;
      console.log(`Using summed package prices: £${subtotal}`);
    }

    // Apply 10% discount to DHL Express static pricing only (never to P2G API quotes)
    if (parcels.length >= 2) {
      const services = parcels.map((p) => p.service);
      const uniqueServices = [...new Set(services)];

      // Separate DHL Express packages from others
      const dhlPackages = parcels.filter((p) =>
        p.service.startsWith("DHL Express")
      );
      const nonDhlPackages = parcels.filter(
        (p) => !p.service.startsWith("DHL Express")
      );

      if (dhlPackages.length >= 2) {
        // Apply 10% discount only to the DHL Express packages
        const dhlSubtotal = dhlPackages.reduce((sum, p) => sum + p.price, 0);
        discount = Math.round(dhlSubtotal * 0.1 * 100) / 100; // 10% discount on DHL only
        total = Math.round((subtotal - discount) * 100) / 100;

        console.log(
          `DHL Express multi-package discount: ${dhlPackages.length} DHL packages, 10% off DHL portion (£${discount})`
        );
        console.log(
          `DHL services: ${[...new Set(dhlPackages.map((p) => p.service))].join(", ")}`
        );
        if (nonDhlPackages.length > 0) {
          console.log(
            `Non-DHL packages: ${nonDhlPackages.map((p) => p.service).join(", ")} (no discount - P2G optimized)`
          );
        }
        console.log(`Final total: £${subtotal} - £${discount} = £${total}`);
      } else if (
        services.every((service) => service.startsWith("DHL Express"))
      ) {
        // All DHL but less than 2 packages - no discount
        console.log(`Single DHL package, no discount applied`);
        console.log(`Final total: £${total}`);
      } else {
        // Mixed couriers but less than 2 DHL packages - no discount
        console.log(
          `Mixed couriers (${uniqueServices.join(", ")}), no DHL multi-package discount`
        );
        console.log(`Final total: £${total} (P2G quotes already optimized)`);
      }
    } else {
      console.log(`Final total: £${total} (single package, no discount)`);
    }
    const breakdown = parcels.map((p) => ({
      service: p.service,
      price: p.price,
    }));

    // Create detailed package descriptions
    const detailedPackages = parcels.map((p, index) => {
      const itemList = [];
      p.items.forEach((itemName) => {
        const matchedItem = req.body.items.find(
          (item) => item.name === itemName
        );
        if (matchedItem) {
          const weight = Math.round(matchedItem.weight_kg * 10) / 10;
          itemList.push(
            `${matchedItem.thickness_mm}mm Pine Cut To Size (${matchedItem.length_mm} x ${matchedItem.width_mm} x ${matchedItem.thickness_mm}) - ${weight} kg`
          );
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
        price: p.price,
      };

      // Include P2G quote options if available
      if (p.p2g_quotes) {
        details.alternativeServices = p.p2g_quotes.map((q) => ({
          service: q.Service?.Name || q.ServiceName,
          courier: q.Service?.CourierName,
          price: Math.ceil(q.TotalPrice),
          deliveryDays: q.EstimatedDeliveryDays,
        }));
      }

      return details;
    });

    const response = {
      status: "done",
      subtotal: parcels.length >= 2 ? subtotal : undefined,
      discount: parcels.length >= 2 ? discount : undefined,
      total,
      currency: "GBP",
      packages: parcels,
      detailedPackages,
      breakdown,
      source: actualSource,
      p2g_shipment_total: parcels.p2g_shipment_total || 0,
      copy:
        actualSource === "Parcel2Go"
          ? "Live shipping rates from Parcel2Go carriers."
          : "We've checked the best and cheapest option for your order.",
    };

    // Add discount message if applicable
    if (parcels.length >= 2 && discount > 0) {
      const dhlPackages = parcels.filter((p) =>
        p.service.startsWith("DHL Express")
      );
      response.discountMessage = `${dhlPackages.length} DHL Express packages - 10% discount on DHL portion`;
    } else if (parcels.length >= 2 && discount === 0) {
      response.discountMessage = `${parcels.length} packages - no discount (P2G quotes already optimized)`;
    }

    res.json(response);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
