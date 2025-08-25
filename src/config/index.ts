import dotenv from 'dotenv';
import { AppConfig } from '../types';
import pricingConfig from './pricing.json';

dotenv.config();

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '8787', 10),
  secret: process.env.PC4Y_SECRET || 'devsecret',
  publicKey: process.env.PC4Y_PUBLIC_KEY || 'pc4y_pub_dev',
  packing: {
    padding_mm: parseInt(process.env.PADDING_MM || '20', 10),
    density_kg_m3: parseInt(process.env.DENSITY_KG_M3 || '520', 10),
    caps: {
      MAX_LENGTH_MM: parseInt(process.env.MAX_LENGTH_MM || '2600', 10),
      MAX_GIRTH_MM: parseInt(process.env.MAX_GIRTH_MM || '4200', 10),
      MAX_WEIGHT_KG: parseInt(process.env.MAX_WEIGHT_KG || '50', 10),
    },
  },
  ladder: pricingConfig.ladder,
};

export const isDebug = process.env.DEBUG === 'true';
export const isDevelopment = process.env.NODE_ENV === 'development';