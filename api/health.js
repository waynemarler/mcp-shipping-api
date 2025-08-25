module.exports = (req, res) => {
  res.json({ 
    ok: true,
    timestamp: new Date().toISOString(),
    environment: 'production',
    version: '2.1.0-vercel',
    smartPacking: true
  });
};