import { Parcel, PackageBreakdown } from '../types';
import { config, isDebug } from '../config';

export interface PricingResult {
  total: number;
  breakdown: PackageBreakdown[];
}

export function calculatePricing(parcels: Parcel[]): PricingResult {
  let total = 0;
  const breakdown: PackageBreakdown[] = [];
  const { ladder } = config;
  
  for (const parcel of parcels) {
    const matchingBand = ladder.find(band => {
      if (band.maxL !== undefined && parcel.length_mm > band.maxL) return false;
      if (band.maxG !== undefined && parcel.girth_mm > band.maxG) return false;
      if (band.maxWkg !== undefined && parcel.weight_kg > band.maxWkg) return false;
      return true;
    });
    
    const selectedBand = matchingBand || ladder[ladder.length - 1];
    
    parcel.service = selectedBand.name;
    total += selectedBand.price;
    
    breakdown.push({
      service: selectedBand.name,
      price: selectedBand.price,
    });
    
    if (isDebug) {
      console.log(`Parcel (${parcel.length_mm}mm, girth: ${parcel.girth_mm}mm, ${parcel.weight_kg}kg) -> ${selectedBand.name}: £${selectedBand.price}`);
    }
  }
  
  if (isDebug) {
    console.log(`Total shipping cost: £${total}`);
  }
  
  return {
    total: Math.round(total * 100) / 100,
    breakdown,
  };
}

export function formatDimensions(parcel: Parcel): string {
  const lengthCm = Math.round(parcel.length_mm / 10);
  const widthCm = Math.round(parcel.width_mm / 10);
  const heightCm = Math.round(parcel.height_mm / 10);
  
  return `${lengthCm} x ${widthCm} x ${heightCm} cm`;
}