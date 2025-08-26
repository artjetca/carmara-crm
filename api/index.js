/**
 * Vercel deploy entry handler - CommonJS format
 */
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ success: true, message: 'ok' });
});

// Basic auth endpoint for testing
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }
  
  // For now, just return success for testing
  res.json({
    success: true,
    data: {
      user: { email, id: 'test-user' },
      session: { access_token: 'test-token' }
    }
  });
});

// Geocode endpoint for testing
app.post('/api/geocode', (req, res) => {
  const { address } = req.body;
  
  if (!address) {
    return res.status(400).json({ success: false, error: 'Missing address' });
  }
  
  // Mock geocode response
  res.json({
    success: true,
    data: {
      lat: 40.4168,
      lng: -3.7038,
      display_name: `${address}, Madrid, Spain`
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'API not found'
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('API Error:', error);
  res.status(500).json({
    success: false,
    error: 'Server internal error'
  });
});

module.exports = app;
