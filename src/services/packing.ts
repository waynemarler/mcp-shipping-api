import { Item, ExpandedItem, Parcel } from '../types';
import { config, isDebug } from '../config';

export function expandItems(items: Item[]): ExpandedItem[] {
  const expanded: ExpandedItem[] = [];
  
  for (const item of items) {
    const qty = Math.max(1, item.qty || 1);
    
    for (let i = 0; i < qty; i++) {
      const expandedItem: ExpandedItem = {
        ...item,
        weight_kg: item.weight_kg || calculateWeight(item),
      };
      expanded.push(expandedItem);
    }
  }
  
  return expanded;
}

function calculateWeight(item: Item): number {
  const volumeM3 = (item.length_mm / 1000) * 
                   (item.width_mm / 1000) * 
                   (item.thickness_mm / 1000);
  const weight = volumeM3 * config.packing.density_kg_m3;
  
  if (isDebug) {
    console.log(`Calculated weight for ${item.name}: ${weight.toFixed(2)}kg`);
  }
  
  return Math.round(weight * 100) / 100;
}

function calculateGirth(length: number, width: number, height: number): number {
  return length + 2 * (width + height);
}

function shouldSplitPackages(totalWeight: number, maxWeight: number): boolean {
  // If total weight is over max, we need to split
  if (totalWeight > maxWeight) {
    // Don't create packages with very uneven weight distribution
    // For example, avoid 30kg + 8kg, prefer more balanced split
    const numPackages = Math.ceil(totalWeight / maxWeight);
    const avgWeight = totalWeight / numPackages;
    
    // If average weight per package would be less than 60% of max weight,
    // we should try to balance better
    return avgWeight < maxWeight * 0.8;
  }
  return false;
}

export function packItems(items: ExpandedItem[]): Parcel[] {
  const boards = [...items].sort((a, b) => {
    const lengthDiff = b.length_mm - a.length_mm;
    if (lengthDiff !== 0) return lengthDiff;
    return b.width_mm - a.width_mm;
  });
  
  const { caps, padding_mm } = config.packing;
  const MAX_WEIGHT = 30; // Fixed 30kg max per package
  const GIRTH_THRESHOLD = 3000; // 300cm in mm
  
  // Calculate total weight to determine if we need to split
  const totalWeight = boards.reduce((sum, board) => sum + board.weight_kg, 0);
  
  if (isDebug) {
    console.log(`Total weight of all items: ${totalWeight.toFixed(2)}kg`);
    console.log(`Max weight per package: ${MAX_WEIGHT}kg`);
  }
  
  // Determine target number of packages for balanced weight distribution
  let targetPackages = 1;
  if (totalWeight > MAX_WEIGHT) {
    targetPackages = Math.ceil(totalWeight / MAX_WEIGHT);
    // Check if we should increase packages for better balance
    const avgWeight = totalWeight / targetPackages;
    if (avgWeight > MAX_WEIGHT * 0.8) {
      // If average is more than 80% of max, add another package for better distribution
      targetPackages++;
    }
  }
  
  const targetWeightPerPackage = totalWeight / targetPackages;
  
  if (isDebug) {
    console.log(`Target packages: ${targetPackages}, Target weight per package: ${targetWeightPerPackage.toFixed(2)}kg`);
  }
  
  // Initialize parcels based on target
  const parcels: Parcel[] = [];
  
  // Smart packing: distribute boards to achieve balanced weight
  for (const board of boards) {
    let bestParcelIndex = -1;
    let bestScore = Infinity;
    
    // Try to find the best parcel for this board
    for (let i = 0; i < parcels.length; i++) {
      const parcel = parcels[i];
      
      // Calculate new dimensions if we add this board
      const newLength = Math.max(parcel.length_mm - 2 * padding_mm, board.length_mm) + 2 * padding_mm;
      const newWidth = Math.max(parcel.width_mm - 2 * padding_mm, board.width_mm) + 2 * padding_mm;
      const newHeight = parcel.height_mm - 2 * padding_mm + board.thickness_mm + 2 * padding_mm;
      const newWeight = parcel.weight_kg + board.weight_kg;
      const newGirth = calculateGirth(newLength, newWidth, newHeight);
      
      // Check hard constraints
      if (newWeight > MAX_WEIGHT) continue;
      if (newLength > caps.MAX_LENGTH_MM) continue;
      
      // Calculate score based on:
      // 1. How close to target weight (lower is better)
      // 2. Penalty for exceeding girth threshold
      const weightDiff = Math.abs(newWeight - targetWeightPerPackage);
      const girthPenalty = newGirth > GIRTH_THRESHOLD ? 1000 : 0;
      const score = weightDiff + girthPenalty;
      
      if (score < bestScore) {
        bestScore = score;
        bestParcelIndex = i;
      }
    }
    
    // Add to best parcel or create new one
    if (bestParcelIndex >= 0) {
      const parcel = parcels[bestParcelIndex];
      parcel.length_mm = Math.max(parcel.length_mm - 2 * padding_mm, board.length_mm) + 2 * padding_mm;
      parcel.width_mm = Math.max(parcel.width_mm - 2 * padding_mm, board.width_mm) + 2 * padding_mm;
      parcel.height_mm = parcel.height_mm - 2 * padding_mm + board.thickness_mm + 2 * padding_mm;
      parcel.weight_kg = Math.round((parcel.weight_kg + board.weight_kg) * 100) / 100;
      parcel.girth_mm = calculateGirth(parcel.length_mm, parcel.width_mm, parcel.height_mm);
      
      if (!parcel.items) parcel.items = [];
      parcel.items.push(`${board.name} (${board.length_mm}x${board.width_mm}x${board.thickness_mm})`);
    } else {
      // Create new parcel
      const length = board.length_mm + 2 * padding_mm;
      const width = board.width_mm + 2 * padding_mm;
      const height = board.thickness_mm + 2 * padding_mm;
      const girth = calculateGirth(length, width, height);
      
      parcels.push({
        length_mm: length,
        width_mm: width,
        height_mm: height,
        weight_kg: board.weight_kg,
        girth_mm: girth,
        items: [`${board.name} (${board.length_mm}x${board.width_mm}x${board.thickness_mm})`],
      });
    }
  }
  
  // Log package details for debugging
  if (isDebug) {
    console.log(`\nPacked ${items.length} items into ${parcels.length} parcels:`);
    parcels.forEach((p, i) => {
      const girthCm = p.girth_mm / 10;
      const isOversized = p.girth_mm > GIRTH_THRESHOLD;
      console.log(`Parcel ${i + 1}:`);
      console.log(`  Dimensions: ${p.length_mm}x${p.width_mm}x${p.height_mm}mm`);
      console.log(`  Weight: ${p.weight_kg}kg`);
      console.log(`  Girth: ${girthCm}cm ${isOversized ? '(OVERSIZED)' : '(Standard)'}`);
      console.log(`  Items: ${p.items?.length || 0}`);
    });
    
    // Show weight distribution
    const weights = parcels.map(p => p.weight_kg);
    const minWeight = Math.min(...weights);
    const maxWeight = Math.max(...weights);
    const avgWeight = weights.reduce((a, b) => a + b, 0) / weights.length;
    console.log(`\nWeight distribution:`);
    console.log(`  Min: ${minWeight}kg, Max: ${maxWeight}kg, Avg: ${avgWeight.toFixed(2)}kg`);
    console.log(`  Variance: ${(maxWeight - minWeight).toFixed(2)}kg`);
  }
  
  return parcels;
}