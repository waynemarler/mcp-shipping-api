const https = require('https');
const crypto = require('crypto');

// Parcel2Go API Configuration
const P2G_CONFIG = {
  sandbox: {
    authUrl: 'sandbox.parcel2go.com',
    apiUrl: 'sandbox.parcel2go.com',
    clientId: process.env.P2G_CLIENT_ID || 'YOUR_CLIENT_ID',
    clientSecret: process.env.P2G_CLIENT_SECRET || 'YOUR_CLIENT_SECRET'
  },
  production: {
    authUrl: 'www.parcel2go.com',
    apiUrl: 'www.parcel2go.com',
    clientId: process.env.P2G_CLIENT_ID || 'YOUR_CLIENT_ID',
    clientSecret: process.env.P2G_CLIENT_SECRET || 'YOUR_CLIENT_SECRET'
  }
};

const environment = (process.env.P2G_ENVIRONMENT || 'sandbox').toLowerCase();
const config = P2G_CONFIG[environment];

let accessToken = null;
let tokenExpiry = null;

// Get or refresh access token
async function getAccessToken() {
  // Check if we have a valid token
  if (accessToken && tokenExpiry && new Date() < tokenExpiry) {
    return accessToken;
  }

  console.log('Getting new Parcel2Go access token...');
  
  const authData = `grant_type=client_credentials&client_id=${config.clientId}&client_secret=${config.clientSecret}`;
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: config.authUrl,
      port: 443,
      path: '/auth/connect/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(authData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.access_token) {
            accessToken = response.access_token;
            // Set expiry 5 minutes before actual expiry for safety
            const expiresIn = (response.expires_in - 300) * 1000;
            tokenExpiry = new Date(Date.now() + expiresIn);
            console.log('Access token obtained, expires:', tokenExpiry.toISOString());
            resolve(accessToken);
          } else {
            reject(new Error('No access token received'));
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(authData);
    req.end();
  });
}

// Get shipping quotes from Parcel2Go
async function getShippingQuotes(packages, destination) {
  const token = await getAccessToken();
  
  const quotes = [];
  
  for (const pkg of packages) {
    const quoteData = {
      CollectionAddress: {
        Address1: "Unit 1",
        Address2: "Pine Workshop",
        Town: "High Wycombe",
        County: "Buckinghamshire",
        Postcode: "HP12 3RL",
        Country: "GB"
      },
      DeliveryAddress: {
        Town: destination.city || "London",
        Postcode: destination.postalCode || "SW1A 1AA",
        Country: destination.country || "GB"
      },
      Parcels: [{
        Weight: Math.ceil(pkg.weight_kg), // Round up to nearest kg
        Length: Math.ceil(pkg.length_mm / 10), // Convert to cm and round up
        Width: Math.ceil(pkg.width_mm / 10),
        Height: Math.ceil(pkg.height_mm / 10),
        Value: 100 // Default insurance value
      }]
    };

    const quote = await fetchQuote(token, quoteData);
    quotes.push({
      package: pkg,
      quotes: quote
    });
  }
  
  return quotes;
}

// Fetch quote from API
function fetchQuote(token, quoteData) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(quoteData);
    
    const options = {
      hostname: config.apiUrl,
      port: 443,
      path: '/api/quotes',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (error) {
          console.error('Error parsing quote response:', data);
          resolve({ error: 'Failed to parse response', raw: data });
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = {
  getAccessToken,
  getShippingQuotes
};