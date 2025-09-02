const { google } = require('googleapis');

exports.handler = async (event, context) => {
  // Handle CORS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { to, subject, message, type = 'email' } = JSON.parse(event.body);

    // Validate required fields
    if (!to || !message) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields: to, message' })
      };
    }

    // Skip SMS for now - only handle email
    if (type === 'sms') {
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          success: true, 
          message: 'SMS sending not implemented yet',
          type: 'sms'
        })
      };
    }

    // Gmail API configuration
    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      'https://developers.google.com/oauthplayground'
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.GMAIL_REFRESH_TOKEN
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Create email message
    const emailSubject = subject || 'Mensaje desde Casmara CRM';
    const fromEmail = process.env.GMAIL_FROM_EMAIL || 'artjet0805@gmail.com';
    
    const rawMessage = [
      `From: ${fromEmail}`,
      `To: ${to}`,
      `Subject: ${emailSubject}`,
      'Content-Type: text/html; charset=utf-8',
      '',
      `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #4285f4; color: white; padding: 20px; text-align: center;">
          <h2>Casmara CRM</h2>
        </div>
        <div style="padding: 20px; background: #f9f9f9;">
          <div style="background: white; padding: 20px; border-radius: 8px;">
            ${message.replace(/\n/g, '<br>')}
          </div>
        </div>
        <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
          <p>Este mensaje fue enviado desde Casmara CRM</p>
        </div>
      </div>`
    ].join('\n');

    // Encode message in base64
    const encodedMessage = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Send email
    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    });

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify({
        success: true,
        messageId: result.data.id,
        to: to,
        subject: emailSubject,
        type: 'email'
      })
    };

  } catch (error) {
    console.error('Email sending error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify({
        success: false,
        error: error.message,
        details: error.response?.data || null
      })
    };
  }
};

