export interface Item {
  sku?: string;
  name: string;
  length_mm: number;
  width_mm: number;
  thickness_mm: number;
  weight_kg?: number;
  qty?: number;
}

export interface ExpandedItem extends Item {
  weight_kg: number;
}

export interface Parcel {
  length_mm: number;
  width_mm: number;
  height_mm: number;
  weight_kg: number;
  girth_mm: number;
  service?: string;
  items?: string[];
}

export interface Destination {
  country: string;
  postalCode: string;
  city?: string;
}

export interface QuotePreferences {
  speed?: 'cheapest' | 'fastest' | 'balanced';
  allowSplit?: boolean;
  maxWaitSeconds?: number;
}

export interface QuoteRequest {
  cartId?: string;
  destination: Destination;
  items: Item[];
  preferences?: QuotePreferences;
}

export interface PricingBand {
  name: string;
  maxL?: number;
  maxG?: number;
  maxWkg?: number;
  price: number;
}

export interface PackageBreakdown {
  service: string;
  price: number;
}

export interface QuoteResponse {
  status: 'pending' | 'done' | 'error';
  jobId?: string;
  total?: number;
  currency?: string;
  packages?: Parcel[];
  breakdown?: PackageBreakdown[];
  copy?: string;
  error?: string;
}

export interface PackingConfig {
  padding_mm: number;
  density_kg_m3: number;
  caps: {
    MAX_LENGTH_MM: number;
    MAX_GIRTH_MM: number;
    MAX_WEIGHT_KG: number;
  };
}

export interface AppConfig {
  port: number;
  secret: string;
  publicKey: string;
  packing: PackingConfig;
  ladder: PricingBand[];
}