// Test Parcel2Go authentication
const { getAccessToken } = require('./parcel2go-integration');

async function testAuth() {
  console.log('Testing Parcel2Go API Authentication...\n');
  console.log('Environment:', process.env.P2G_ENVIRONMENT || 'sandbox');
  console.log('Client ID:', process.env.P2G_CLIENT_ID || 'NOT SET');
  console.log('Client Secret:', process.env.P2G_CLIENT_SECRET ? 'SET' : 'NOT SET');
  
  try {
    const token = await getAccessToken();
    console.log('\n✅ Authentication successful!');
    console.log('Token (first 20 chars):', token.substring(0, 20) + '...');
  } catch (error) {
    console.error('\n❌ Authentication failed:', error.message);
    console.error('\nPlease set these environment variables:');
    console.error('- P2G_CLIENT_ID: Your Parcel2Go API Client ID');
    console.error('- P2G_CLIENT_SECRET: Your Parcel2Go API Client Secret');
    console.error('- P2G_ENVIRONMENT: sandbox or production (optional, defaults to sandbox)');
  }
}

testAuth();