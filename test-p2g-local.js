// Load environment variables from .env file
require('dotenv').config();

// Test Parcel2Go authentication with local .env
const { getAccessToken } = require('./parcel2go-integration');

async function testAuth() {
  console.log('Testing Parcel2Go API Authentication with local .env...\n');
  console.log('Environment:', process.env.P2G_ENVIRONMENT || 'not set');
  console.log('Client ID:', process.env.P2G_CLIENT_ID ? 'SET (' + process.env.P2G_CLIENT_ID.substring(0, 20) + '...)' : 'NOT SET');
  console.log('Client Secret:', process.env.P2G_CLIENT_SECRET ? 'SET' : 'NOT SET');
  
  // Override environment to lowercase if needed
  if (process.env.P2G_ENVIRONMENT) {
    process.env.P2G_ENVIRONMENT = process.env.P2G_ENVIRONMENT.toLowerCase();
  }
  
  try {
    const token = await getAccessToken();
    console.log('\n✅ Authentication successful!');
    console.log('Token received (first 20 chars):', token.substring(0, 20) + '...');
    console.log('\nYou can now add these exact values to Vercel:');
    console.log('P2G_CLIENT_ID =', process.env.P2G_CLIENT_ID);
    console.log('P2G_CLIENT_SECRET =', process.env.P2G_CLIENT_SECRET);
    console.log('P2G_ENVIRONMENT = production');
  } catch (error) {
    console.error('\n❌ Authentication failed:', error.message);
    console.error('Error details:', error);
  }
}

testAuth();