import fetch from 'node-fetch'
import dotenv from 'dotenv'
dotenv.config()

console.log('🧪 Testing Netlify Function...\n')

// Test the send-email function
async function testSendEmail() {
  try {
    console.log('Testing /.netlify/functions/send-email endpoint...')
    
    const response = await fetch('http://localhost:8888/.netlify/functions/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: 'test@example.com',
        subject: 'Test Email from Casmara CRM',
        message: 'This is a test message',
        type: 'email'
      })
    })

    console.log('Response status:', response.status)
    console.log('Response headers:', Object.fromEntries(response.headers))
    
    const data = await response.text()
    console.log('Response body:', data)
    
    if (response.ok) {
      console.log('✅ Netlify function is accessible')
    } else {
      console.log('❌ Netlify function returned error status')
    }
    
  } catch (error) {
    console.log('❌ Failed to reach Netlify function:', error.message)
    console.log('ℹ️ Make sure to run "netlify dev" to start local development server')
  }
}

// Test production endpoint if local fails
async function testProductionEndpoint() {
  try {
    console.log('\nTesting production endpoint...')
    
    const response = await fetch('https://carmara-crm.netlify.app/.netlify/functions/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: 'test@example.com',
        subject: 'Test Email from Casmara CRM',
        message: 'This is a test message',
        type: 'email'
      })
    })

    console.log('Production response status:', response.status)
    const data = await response.text()
    console.log('Production response:', data)
    
  } catch (error) {
    console.log('❌ Production endpoint error:', error.message)
  }
}

await testSendEmail()
await testProductionEndpoint()

console.log('\n🔍 Test complete')
