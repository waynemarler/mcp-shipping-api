import { Router, Request, Response } from 'express';
import { QuoteRequest, QuoteResponse } from '../types';
import { expandItems, packItems } from '../services/packing';
import { calculatePricing } from '../services/pricing';
import { hmacAuth } from '../middleware/auth';
import { isDebug } from '../config';

const router = Router();

router.post('/instant-quote', hmacAuth, (req: Request, res: Response) => {
  try {
    const quoteRequest: QuoteRequest = req.body;
    
    if (!quoteRequest.items || quoteRequest.items.length === 0) {
      res.status(400).json({ error: 'No items provided' });
      return;
    }
    
    if (!quoteRequest.destination) {
      res.status(400).json({ error: 'No destination provided' });
      return;
    }
    
    if (isDebug) {
      console.log('Processing quote request:', {
        cartId: quoteRequest.cartId,
        destination: quoteRequest.destination,
        itemCount: quoteRequest.items.length,
      });
    }
    
    const expandedItems = expandItems(quoteRequest.items);
    const parcels = packItems(expandedItems);
    const { total, breakdown } = calculatePricing(parcels);
    
    const response: QuoteResponse = {
      status: 'done',
      total,
      currency: 'GBP',
      packages: parcels.map(p => ({
        ...p,
        items: undefined,
      })),
      breakdown,
      copy: "We've checked the best and cheapest option for your order.",
    };
    
    res.json(response);
  } catch (error) {
    console.error('Quote processing error:', error);
    res.status(500).json({ 
      status: 'error',
      error: 'Failed to process quote',
    });
  }
});

router.post('/quote', hmacAuth, (req: Request, res: Response) => {
  try {
    const quoteRequest: QuoteRequest = req.body;
    
    if (!quoteRequest.items || quoteRequest.items.length === 0) {
      res.status(400).json({ error: 'No items provided' });
      return;
    }
    
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    setTimeout(() => {
      const expandedItems = expandItems(quoteRequest.items);
      const parcels = packItems(expandedItems);
      const { total, breakdown } = calculatePricing(parcels);
      
      asyncQuotes.set(jobId, {
        status: 'done',
        total,
        currency: 'GBP',
        packages: parcels,
        breakdown,
        copy: "We've checked the best and cheapest option for your order.",
      });
    }, 2000);
    
    asyncQuotes.set(jobId, { status: 'pending' });
    
    res.json({
      status: 'pending',
      jobId,
    });
  } catch (error) {
    console.error('Async quote error:', error);
    res.status(500).json({ 
      status: 'error',
      error: 'Failed to create quote job',
    });
  }
});

const asyncQuotes = new Map<string, QuoteResponse>();

router.get('/quote/:jobId', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const quote = asyncQuotes.get(jobId);
  
  if (!quote) {
    res.status(404).json({ 
      status: 'error',
      error: 'Quote job not found',
    });
    return;
  }
  
  res.json(quote);
  
  if (quote.status === 'done') {
    setTimeout(() => asyncQuotes.delete(jobId), 60000);
  }
});

export default router;