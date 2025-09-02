const { createClient } = require('@supabase/supabase-js');
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

  try {
    console.log('🕐 Email Scheduler running...');

    // Initialize Supabase client
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get current time
    const now = new Date().toISOString();
    console.log('Current time:', now);

    // Find pending emails that should be sent now
    const { data: pendingEmails, error: fetchError } = await supabase
      .from('scheduled_messages')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', now)
      .limit(50); // Process max 50 emails per run

    if (fetchError) {
      console.error('Error fetching pending emails:', fetchError);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Failed to fetch pending emails' })
      };
    }

    console.log(`Found ${pendingEmails?.length || 0} emails to send`);

    if (!pendingEmails || pendingEmails.length === 0) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'No emails to send', processed: 0 })
      };
    }

    // Get customers data
    const customerIds = [...new Set(pendingEmails.flatMap(email => email.customer_ids))];
    const { data: customers, error: customerError } = await supabase
      .from('customers')
      .select('id, name, email, company')
      .in('id', customerIds);

    if (customerError) {
      console.error('Error fetching customers:', customerError);
    }

    // Setup Gmail API
    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      'https://developers.google.com/oauthplayground'
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.GMAIL_REFRESH_TOKEN
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const fromEmail = process.env.GMAIL_FROM_EMAIL || 'artjet0805@gmail.com';

    let processed = 0;
    let failed = 0;

    // Process each email
    for (const emailRecord of pendingEmails) {
      try {
        // Find customer for this email
        const customer = customers?.find(c => emailRecord.customer_ids.includes(c.id));
        
        if (!customer?.email) {
          console.log(`Skipping email ${emailRecord.id} - no customer email found`);
          await supabase
            .from('scheduled_messages')
            .update({ 
              status: 'failed',
              error_message: 'Customer email not found'
            })
            .eq('id', emailRecord.id);
          failed++;
          continue;
        }

        // Extract subject and message from the stored message
        const messageText = emailRecord.message;
        let subject = 'Mensaje desde Casmara CRM';
        let content = messageText;

        // Try to extract subject if it's in the message format
        const subjectMatch = messageText.match(/\(([^)]+)\)/);
        if (subjectMatch) {
          subject = subjectMatch[1];
          content = messageText.replace(/\s*\([^)]+\)/, '');
        }

        // Remove EMAIL: prefix if present
        content = content.replace(/^EMAIL:\s*/, '');

        // Create email content with template
        const emailContent = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #4285f4; color: white; padding: 20px; text-align: center;">
            <h2>Casmara CRM</h2>
          </div>
          <div style="padding: 20px; background: #f9f9f9;">
            <div style="background: white; padding: 20px; border-radius: 8px;">
              ${content.replace(/\n/g, '<br>')}
            </div>
          </div>
          <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
            <p>Este mensaje fue enviado desde Casmara CRM</p>
          </div>
        </div>`;

        // Create email message
        const rawMessage = [
          `From: ${fromEmail}`,
          `To: ${customer.email}`,
          `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
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
        await gmail.users.messages.send({
          userId: 'me',
          requestBody: {
            raw: encodedMessage
          }
        });

        // Update status to sent
        await supabase
          .from('scheduled_messages')
          .update({ status: 'sent' })
          .eq('id', emailRecord.id);

        console.log(`✅ Email sent to ${customer.email} for message ${emailRecord.id}`);
        processed++;

      } catch (error) {
        console.error(`❌ Failed to send email ${emailRecord.id}:`, error.message);
        
        // Update status to failed
        await supabase
          .from('scheduled_messages')
          .update({ 
            status: 'failed',
            error_message: error.message
          })
          .eq('id', emailRecord.id);
        
        failed++;
      }
    }

    console.log(`📊 Scheduler completed: ${processed} sent, ${failed} failed`);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ 
        message: 'Email scheduler completed',
        processed,
        failed,
        total: pendingEmails.length
      })
    };

  } catch (error) {
    console.error('❌ Scheduler error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message })
    };
  }
};
