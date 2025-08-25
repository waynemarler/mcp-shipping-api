import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config, isDebug } from '../config';

export interface AuthenticatedRequest extends Request {
  timestamp?: string;
}

export function hmacAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  try {
    const timestamp = req.header('X-PC4Y-Timestamp');
    const signature = req.header('X-PC4Y-Signature');
    const publicKey = req.header('X-PC4Y-Key');

    if (!timestamp || !signature || !publicKey) {
      if (isDebug) {
        console.log('Missing auth headers:', { timestamp, signature, publicKey });
      }
      res.status(401).json({ error: 'Missing authentication headers' });
      return;
    }

    if (publicKey !== config.publicKey) {
      if (isDebug) {
        console.log('Invalid public key:', publicKey);
      }
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    const now = Date.now();
    const requestTime = parseInt(timestamp, 10);
    const timeDiff = Math.abs(now - requestTime);
    const maxDrift = 5 * 60 * 1000;

    if (timeDiff > maxDrift) {
      if (isDebug) {
        console.log('Timestamp out of range:', { now, requestTime, diff: timeDiff });
      }
      res.status(401).json({ error: 'Request timestamp too old' });
      return;
    }

    const rawBody = JSON.stringify(req.body || {});
    const message = `${timestamp}.${rawBody}`;
    const expectedSignature = crypto
      .createHmac('sha256', config.secret)
      .update(message)
      .digest('hex');

    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
      if (isDebug) {
        console.log('Signature mismatch:', { 
          provided: signature, 
          expected: expectedSignature,
          message: message.substring(0, 100)
        });
      }
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    req.timestamp = timestamp;
    next();
  } catch (error) {
    if (isDebug) {
      console.error('Auth middleware error:', error);
    }
    res.status(500).json({ error: 'Authentication error' });
  }
}

export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const hasAuthHeaders = req.header('X-PC4Y-Timestamp') || 
                         req.header('X-PC4Y-Signature') || 
                         req.header('X-PC4Y-Key');
  
  if (hasAuthHeaders) {
    return hmacAuth(req, res, next);
  }
  
  next();
}