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

export function packItems(items: ExpandedItem[]): Parcel[] {
  const boards = [...items].sort((a, b) => {
    const lengthDiff = b.length_mm - a.length_mm;
    if (lengthDiff !== 0) return lengthDiff;
    return b.width_mm - a.width_mm;
  });
  
  const parcels: Parcel[] = [];
  const { caps, padding_mm } = config.packing;
  
  for (const board of boards) {
    let placed = false;
    
    for (const parcel of parcels) {
      const newLength = Math.max(parcel.length_mm - 2 * padding_mm, board.length_mm) + 2 * padding_mm;
      const newWidth = Math.max(parcel.width_mm - 2 * padding_mm, board.width_mm) + 2 * padding_mm;
      const newHeight = parcel.height_mm - 2 * padding_mm + board.thickness_mm + 2 * padding_mm;
      const newWeight = parcel.weight_kg + board.weight_kg;
      const newGirth = newLength + 2 * (newWidth + newHeight);
      
      if (newLength <= caps.MAX_LENGTH_MM &&
          newGirth <= caps.MAX_GIRTH_MM &&
          newWeight <= caps.MAX_WEIGHT_KG) {
        
        parcel.length_mm = newLength;
        parcel.width_mm = newWidth;
        parcel.height_mm = newHeight;
        parcel.weight_kg = Math.round(newWeight * 100) / 100;
        parcel.girth_mm = newGirth;
        
        if (!parcel.items) parcel.items = [];
        parcel.items.push(`${board.name} (${board.length_mm}x${board.width_mm}x${board.thickness_mm})`);
        
        placed = true;
        break;
      }
    }
    
    if (!placed) {
      const length = board.length_mm + 2 * padding_mm;
      const width = board.width_mm + 2 * padding_mm;
      const height = board.thickness_mm + 2 * padding_mm;
      const girth = length + 2 * (width + height);
      
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
  
  if (isDebug) {
    console.log(`Packed ${items.length} items into ${parcels.length} parcels`);
    parcels.forEach((p, i) => {
      console.log(`Parcel ${i + 1}: ${p.length_mm}x${p.width_mm}x${p.height_mm}mm, ${p.weight_kg}kg, girth: ${p.girth_mm}mm`);
    });
  }
  
  return parcels;
}