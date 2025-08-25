# PineCut4You MCP Shipping API

Dynamic shipping calculator API for WooCommerce integration.

## Features

- HMAC-authenticated REST API
- Deterministic packing algorithm (matches PHP implementation)
- Configurable pricing ladder
- Fast synchronous quotes (<100ms)
- TypeScript with strict typing
- Ready for Krystal cPanel deployment

## Local Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Testing

```bash
# Test health endpoint
curl http://localhost:8787/health

# Test with authentication (see test-live.js)
node test-live.js
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

- `PORT` - Server port (default: 8787)
- `PC4Y_SECRET` - HMAC secret key
- `PC4Y_PUBLIC_KEY` - Public API key
- `PADDING_MM` - Package padding in mm
- `DENSITY_KG_M3` - Wood density for weight calculation
- `MAX_LENGTH_MM`, `MAX_GIRTH_MM`, `MAX_WEIGHT_KG` - Package limits

## Deployment to Krystal

1. Push to Git repository in cPanel
2. SSH into server and run `npm install`
3. Build with `npm run build`
4. Configure Node.js app in cPanel to run `build/server.js`
5. Set environment variables in cPanel
6. Start the application

## WooCommerce Integration

Use the provided `woocommerce-integration.php` code in your custom shipping method.

Update the endpoint URL and API keys for production:
```php
$this->endpoint = 'https://api.pinecut4you.co.uk/instant-quote';
$this->public_key = 'your_production_public_key';
$this->secret = 'your_production_secret';
```

## API Endpoints

- `GET /health` - Health check
- `POST /instant-quote` - Synchronous quote (requires HMAC auth)
- `POST /quote` - Async quote job creation (requires HMAC auth)
- `GET /quote/:jobId` - Poll async quote status

## Pricing Configuration

Edit `src/config/pricing.json` to adjust shipping bands:

```json
{
  "ladder": [
    {
      "name": "Standard",
      "maxL": 2000,
      "maxG": 3000,
      "maxWkg": 30,
      "price": 25
    }
  ]
}
```