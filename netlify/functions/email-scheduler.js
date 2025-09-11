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

    // Also fetch overall pending (for debug: next upcoming time)
    const { data: allPending, error: allPendingErr } = await supabase
      .from('scheduled_messages')
      .select('id, scheduled_for')
      .eq('status', 'pending')
      .order('scheduled_for', { ascending: true })
      .limit(50);

    if (allPendingErr) {
      console.error('Error fetching all pending:', allPendingErr);
    }

    const pendingTotalCount = allPending?.length || 0;
    const nextPendingAt = pendingTotalCount > 0 ? allPending[0].scheduled_for : null;

    console.log(`Found ${pendingEmails?.length || 0} emails to send`);
    console.log('Pending total:', pendingTotalCount, 'Next pending at:', nextPendingAt, 'Now:', now);

    if (!pendingEmails || pendingEmails.length === 0) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ 
          message: 'No emails to send', 
          processed: 0,
          pending_total: pendingTotalCount,
          next_pending_at: nextPendingAt,
          now
        })
      };
    }

    // Get customers data (support both new: customer_ids[] and legacy: customer_id)
    const customerIds = [...new Set(
      (pendingEmails || []).flatMap((email) => {
        if (Array.isArray(email?.customer_ids)) return email.customer_ids.filter(Boolean)
        if (typeof email?.customer_ids === 'string' && email.customer_ids) return [email.customer_ids]
        if (email?.customer_id) return [email.customer_id]
        return []
      })
    )];
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
        // Resolve target customer IDs (robust to both formats)
        const targetIds = Array.isArray(emailRecord?.customer_ids)
          ? emailRecord.customer_ids.filter(Boolean)
          : (emailRecord?.customer_ids && typeof emailRecord.customer_ids === 'string')
            ? [emailRecord.customer_ids]
            : (emailRecord?.customer_id ? [emailRecord.customer_id] : [])

        // Find customer in pre-fetched list
        let customer = customers?.find(c => targetIds.includes(c.id));

        // Fallback: fetch individually if not found (e.g., legacy row inserted earlier)
        if (!customer && targetIds.length > 0) {
          try {
            const { data: single, error: singleErr } = await supabase
              .from('customers')
              .select('id, name, email, company')
              .eq('id', targetIds[0])
              .single();
            if (!singleErr && single) customer = single;
          } catch (_) {}
        }

        
        if (!customer) {
          console.log(`[Scheduler] Skipping email ${emailRecord.id} - customer not found in database`);
          console.log(`[Scheduler] Candidate IDs: ${JSON.stringify(targetIds)}`);
          await supabase
            .from('scheduled_messages')
            .update({ 
              status: 'failed',
              error_message: 'Customer not found in database'
            })
            .eq('id', emailRecord.id);
          failed++;
          continue;
        }
        
        if (!customer.email) {
          console.log(`Skipping email ${emailRecord.id} - customer ${customer.name} has no email address`);
          await supabase
            .from('scheduled_messages')
            .update({ 
              status: 'failed',
              error_message: `Customer ${customer.name} has no email address`
            })
            .eq('id', emailRecord.id);
          failed++;
          continue;
        }

        // Extract subject and message from the stored message
        const messageText = emailRecord.message;
        let subject = 'Mensaje desde Casmara CRM';
        let content = messageText;

        // Handle new message format: "Mensaje: content (subject)" or old "EMAIL: content (subject)"
        if (content.startsWith('Mensaje:')) {
          content = content.replace(/^Mensaje:\s*/, '');
          
          // Try to extract subject if it's in parentheses at the end
          const subjectMatch = content.match(/\s*\(([^)]+)\)\s*$/);
          if (subjectMatch) {
            subject = subjectMatch[1];
            content = content.replace(/\s*\([^)]+\)\s*$/, '');
          }
        } else if (content.startsWith('EMAIL:')) {
          // Handle old format for backward compatibility
          content = content.replace(/^EMAIL:\s*/, '');
          const subjectMatch = content.match(/\s*\(([^)]+)\)\s*$/);
          if (subjectMatch) {
            subject = subjectMatch[1];
            content = content.replace(/\s*\([^)]+\)\s*$/, '');
          }
        }

        // Check for confirmation flag in message content (temporary workaround for schema cache)
        let includeConfirmation = false;
        if (content.includes('|INCLUDE_CONFIRMATION:true|')) {
          includeConfirmation = true;
          content = content.replace(/\s*\|INCLUDE_CONFIRMATION:true\|\s*$/, '');
        }
        
        // Fallback to database column if available
        if (emailRecord.include_confirmation !== undefined) {
          includeConfirmation = emailRecord.include_confirmation;
        }
        
        // Clean up content by removing any trailing customer info
        content = content.replace(/\s*\|\s*Cliente:.*$/, '').trim();

        // Detect if content contains HTML tags (for rich HTML mode)
        const isHtml = /<[^>]+>/.test(content)

        // Use send-email function to handle confirmation buttons properly
        const sendEmailUrl = `${process.env.URL || 'https://casmara-charo.netlify.app'}/.netlify/functions/send-email`;
        
        const emailResponse = await fetch(sendEmailUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: customer.email,
            subject: subject,
            message: content,
            type: 'email',
            isHtml,
            messageId: emailRecord.id,
            customerId: customer.id,
            includeConfirmation: includeConfirmation
          })
        });

        const emailResult = await emailResponse.json();
        
        if (!emailResponse.ok || !emailResult.success) {
          throw new Error(emailResult.error || 'Failed to send email via send-email function');
        }

        // Update status to sent
        await supabase
          .from('scheduled_messages')
          .update({ status: 'sent' })
          .eq('id', emailRecord.id);

        console.log(`✅ Email sent to ${customer.email} (${customer.name}) for message ${emailRecord.id}`);
        console.log(`   Subject: ${subject}`);
        console.log(`   Content preview: ${content.substring(0, 100)}...`);
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
        total: pendingEmails.length,
        due_ids: (pendingEmails || []).map(e => e.id),
        pending_total: pendingTotalCount,
        next_pending_at: nextPendingAt,
        now
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
