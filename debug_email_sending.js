// Debug script to test email sending functionality
const fetch = require('node-fetch');

async function testEmailSending() {
  console.log('🧪 Testing email sending functionality...\n');
  
  try {
    // Test with the Netlify function endpoint
    const response = await fetch('http://localhost:8888/.netlify/functions/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: 'artjet0805@gmail.com',
        subject: 'Test Email - Casmara CRM Debug',
        message: 'This is a test email to verify Gmail API integration is working correctly.',
        type: 'email'
      })
    });

    const result = await response.json();
    
    console.log('Response Status:', response.status);
    console.log('Response Data:', JSON.stringify(result, null, 2));
    
    if (response.ok && result.success) {
      console.log('✅ Email sent successfully!');
    } else {
      console.log('❌ Email sending failed:', result.error);
      if (result.missingVars) {
        console.log('Missing environment variables:', result.missingVars);
      }
    }
    
  } catch (error) {
    console.error('❌ Network error:', error.message);
    console.log('\n💡 Make sure Netlify Dev is running: npm run dev');
  }
}

// Check if running in local dev environment
if (process.env.NODE_ENV !== 'production') {
  console.log('Environment: Local Development');
  console.log('Required environment variables for Gmail API:');
  console.log('- GMAIL_CLIENT_ID:', process.env.GMAIL_CLIENT_ID ? '✅ Set' : '❌ Missing');
  console.log('- GMAIL_CLIENT_SECRET:', process.env.GMAIL_CLIENT_SECRET ? '✅ Set' : '❌ Missing');  
  console.log('- GMAIL_REFRESH_TOKEN:', process.env.GMAIL_REFRESH_TOKEN ? '✅ Set' : '❌ Missing');
  console.log('- GMAIL_FROM_EMAIL:', process.env.GMAIL_FROM_EMAIL ? '✅ Set' : '❌ Missing');
  console.log('');
}

testEmailSending();
