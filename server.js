// DigitalCreative M-Pesa Backend
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// M-Pesa Sandbox Credentials
const MPESA_CONFIG = {
  consumerKey: 'N01URGhqalXORYLphqVdwFKhLRwZ2B3P3bSBr65eeLmJwCn4c7o',
  consumerSecret: '6ICXUIrP2Ynu6U3M8Ks6O98gqNQAX4pCf9Ygw5zsB9lHDjply6AvqN6wEUALOayp',
  businessShortCode: '174379',
  passkey: 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919'
};

// Store transactions
let transactions = [];

// Get M-Pesa Access Token
async function getMpesaAccessToken() {
  try {
    const auth = Buffer.from(`${MPESA_CONFIG.consumerKey}:${MPESA_CONFIG.consumerSecret}`).toString('base64');
    
    const response = await axios.get(
      'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      {
        headers: {
          'Authorization': `Basic ${auth}`
        }
      }
    );
    
    return response.data.access_token;
  } catch (error) {
    console.error('Error getting access token:', error.message);
    throw error;
  }
}

// STK Push Endpoint
app.post('/api/mpesa/stkpush', async (req, res) => {
  try {
    const { phone, amount, plan } = req.body;
    
    console.log('📱 STK Push request received:', { phone, amount, plan });
    
    // Get access token
    const accessToken = await getMpesaAccessToken();
    console.log('✅ Access token received');
    
    // Generate timestamp (YYYYMMDDHHmmss)
    const now = new Date();
    const timestamp = now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');
    
    // Generate password
    const password = Buffer.from(
      MPESA_CONFIG.businessShortCode +
      MPESA_CONFIG.passkey +
      timestamp
    ).toString('base64');
    
    // STK Push data
    const stkData = {
      BusinessShortCode: MPESA_CONFIG.businessShortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: amount,
      PartyA: phone,
      PartyB: MPESA_CONFIG.businessShortCode,
      PhoneNumber: phone,
      CallBackURL: "https://webhook.site/8d7a5e1a-9f4a-4b8d-9e3c-1a2b3c4d5e6f",
      AccountReference: `DC${plan.toUpperCase()}`,
      TransactionDesc: `DigitalCreative - ${plan} Plan`
    };
    
    console.log('🔄 Sending STK Push to M-Pesa...');
    
    // Send to M-Pesa
    const response = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      stkData,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ M-Pesa response:', response.data);
    
    // Store transaction
    const transaction = {
      id: Date.now().toString(),
      phone: phone,
      amount: amount,
      plan: plan,
      checkoutRequestID: response.data.CheckoutRequestID,
      merchantRequestID: response.data.MerchantRequestID,
      status: 'pending',
      timestamp: new Date().toISOString()
    };
    
    transactions.push(transaction);
    
    res.json({
      success: true,
      message: 'STK Push sent successfully! Check your phone.',
      data: response.data,
      transactionId: transaction.id
    });
    
  } catch (error) {
    console.error('❌ STK Push error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to process payment: ' + error.message
    });
  }
});

// Check Payment Status
app.post('/api/mpesa/check-status', async (req, res) => {
  try {
    const { checkoutRequestID } = req.body;
    
    console.log('🔍 Checking payment status:', checkoutRequestID);
    
    const accessToken = await getMpesaAccessToken();
    
    // Generate timestamp and password
    const now = new Date();
    const timestamp = now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');
    
    const password = Buffer.from(
      MPESA_CONFIG.businessShortCode +
      MPESA_CONFIG.passkey +
      timestamp
    ).toString('base64');
    
    const queryData = {
      BusinessShortCode: MPESA_CONFIG.businessShortCode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestID
    };
    
    const response = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query',
      queryData,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('📊 Status check result:', response.data);
    
    res.json({
      success: true,
      data: response.data
    });
    
  } catch (error) {
    console.error('❌ Status check error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: '✅ DigitalCreative M-Pesa Server is running!',
    service: 'M-Pesa Integration Backend',
    timestamp: new Date().toISOString(),
    environment: 'sandbox'
  });
});

// Get all transactions
app.get('/api/transactions', (req, res) => {
  res.json({
    success: true,
    count: transactions.length,
    transactions: transactions
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.send(`
        <html>
            <head>
                <title>DigitalCreative M-Pesa Backend</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
                    .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    h1 { color: #333; border-bottom: 2px solid #4ecdc4; padding-bottom: 10px; }
                    .endpoint { background: #f8f9fa; padding: 15px; margin: 10px 0; border-left: 4px solid #4ecdc4; }
                    .success { color: #28a745; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🚀 DigitalCreative M-Pesa Backend</h1>
                    <p class="success">✅ Server is running successfully!</p>
                    
                    <h2>Available Endpoints:</h2>
                    
                    <div class="endpoint">
                        <strong>GET /api/health</strong><br>
                        <em>Health check and server status</em>
                    </div>
                    
                    <div class="endpoint">
                        <strong>POST /api/mpesa/stkpush</strong><br>
                        <em>Initiate M-Pesa STK Push</em><br>
                        Body: { "phone": "254712345678", "amount": 1, "plan": "basic" }
                    </div>
                    
                    <div class="endpoint">
                        <strong>POST /api/mpesa/check-status</strong><br>
                        <em>Check payment status</em><br>
                        Body: { "checkoutRequestID": "your-request-id" }
                    </div>
                    
                    <div class="endpoint">
                        <strong>GET /api/transactions</strong><br>
                        <em>View all transactions</em>
                    </div>
                    
                    <p><strong>Test Phone:</strong> 254708700675</p>
                    <p><strong>Test Amount:</strong> 1 KES</p>
                    <p><strong>Test PIN:</strong> 174379</p>
                </div>
            </body>
        </html>
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 DigitalCreative M-Pesa Server running on port ${PORT}`);
});