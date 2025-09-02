const { google } = require('googleapis');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    }
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' })
    }
  }

  // Validate environment variables
  const requiredEnvVars = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'GMAIL_FROM_EMAIL']
  const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar])
  
  if (missingEnvVars.length > 0) {
    console.error('Missing environment variables:', missingEnvVars)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: `Gmail API not configured. Missing environment variables: ${missingEnvVars.join(', ')}`,
        missingVars: missingEnvVars
      })
    }
  }

  try {
    const { to, subject, message, type, isHtml } = JSON.parse(event.body || '{}')

    if (!to || !subject || !message) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing required fields: to, subject, message' })
      }
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
    
    let emailContent;
    
    if (isHtml) {
      // Use custom HTML content directly
      emailContent = message;
    } else {
      // Use default template for plain text
      emailContent = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
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
      </div>`;
    }
    
    const rawMessage = [
      `From: ${fromEmail}`,
      `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(emailSubject).toString('base64')}?=`,
      'Content-Type: text/html; charset=utf-8',
      '',
      emailContent
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

