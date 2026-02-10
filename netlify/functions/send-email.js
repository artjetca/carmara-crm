const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Initialize Supabase client for creating response tokens
let supabase = null;
if (supabaseUrl && supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey);
}

// Generate secure token for appointment response links
function generateResponseToken(messageId, customerId, responseType) {
  const data = `${messageId}-${customerId}-${responseType}-${Date.now()}`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
}

// Generate secure token for email tracking
function generateTrackingToken(messageId, customerId) {
  const data = `tracking-${messageId}-${customerId}-${Date.now()}`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
}

// Create tracking token for email open detection
async function createTrackingToken(messageId, customerId) {
  if (!supabase) return null;
  
  try {
    const trackingToken = generateTrackingToken(messageId, customerId);
    
    const { error } = await supabase
      .from('email_tracking')
      .insert({
        message_id: messageId,
        customer_id: customerId,
        tracking_token: trackingToken
      });

    if (error) {
      console.error('Error creating tracking token:', error);
      return null;
    }

    return trackingToken;
  } catch (error) {
    console.error('Error in createTrackingToken:', error);
    return null;
  }
}

// Create response tokens for appointment confirmation
async function createResponseTokens(messageId, customerId) {
  if (!supabase) return { confirmToken: null, rescheduleToken: null };
  
  try {
    const confirmToken = generateResponseToken(messageId, customerId, 'confirm');
    const rescheduleToken = generateResponseToken(messageId, customerId, 'reschedule');
    
    // Insert both tokens
    const { error } = await supabase
      .from('appointment_responses')
      .insert([
        {
          message_id: messageId,
          customer_id: customerId,
          response_token: confirmToken,
          response_type: 'confirm',
          responded_at: null
        },
        {
          message_id: messageId,
          customer_id: customerId,
          response_token: rescheduleToken,
          response_type: 'reschedule',
          responded_at: null
        }
      ]);

    if (error) {
      console.error('Error creating response tokens:', error);
      return { confirmToken: null, rescheduleToken: null };
    }

    return { confirmToken, rescheduleToken };
  } catch (error) {
    console.error('Error in createResponseTokens:', error);
    return { confirmToken: null, rescheduleToken: null };
  }
}

// Guess a basic content type from filename when not provided
function guessContentType(filename) {
  const lower = (filename || '').toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  return 'application/octet-stream'
}

// Extract inline CID attachment descriptors from HTML content
function extractCidDescriptors(html) {
  const descriptors = []
  if (!html) return descriptors
  // Find all <img ...> tags
  const imgRegex = /<img\b[^>]*>/gi
  let match
  while ((match = imgRegex.exec(html)) !== null) {
    const tag = match[0]
    const getAttr = (name) => {
      const m = new RegExp(name + '\\s*=\\s*"([^"]+)"', 'i').exec(tag)
      return m ? m[1] : null
    }
    const bucket = getAttr('data-bucket')
    const path = getAttr('data-path')
    const cidAttr = getAttr('data-cid')
    const src = getAttr('src')
    const cid = cidAttr || (src && src.toLowerCase().startsWith('cid:') ? src.slice(4) : null)
    const contentType = getAttr('data-type')
    if (bucket && path && cid) {
      const filename = path.split('/').pop() || `${cid}.bin`
      descriptors.push({ bucket, path, cid, contentType: contentType || guessContentType(filename), filename })
    }
  }
  return descriptors
}

// Download file from Supabase Storage and return base64 string
async function downloadFromStorageBase64(supabase, bucket, path) {
  try {
    const { data, error } = await supabase.storage.from(bucket).download(path)
    if (error) {
      console.error('Storage download error:', error)
      return null
    }
    // data is a Blob (Node 18 supports arrayBuffer)
    const buffer = Buffer.from(await data.arrayBuffer())
    return buffer.toString('base64')
  } catch (e) {
    console.error('downloadFromStorageBase64 error:', e)
    return null
  }
}

// Build a raw MIME email. If inlineAttachments provided, build multipart/related
function buildRawEmail({ fromEmail, to, subject, html, inlineAttachments = [] }) {
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject || '').toString('base64')}?=`
  if (!inlineAttachments || inlineAttachments.length === 0) {
    const rawMessage = [
      `From: ${fromEmail}`,
      `To: ${to}`,
      `Subject: ${encodedSubject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      html
    ].join('\n')
    return Buffer.from(rawMessage).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  const boundary = '=_Part_' + Math.random().toString(36).slice(2)
  const lines = []
  lines.push(`From: ${fromEmail}`)
  lines.push(`To: ${to}`)
  lines.push(`Subject: ${encodedSubject}`)
  lines.push('MIME-Version: 1.0')
  lines.push(`Content-Type: multipart/related; boundary="${boundary}"`)
  lines.push('')
  // HTML body part
  lines.push(`--${boundary}`)
  lines.push('Content-Type: text/html; charset="UTF-8"')
  lines.push('Content-Transfer-Encoding: 7bit')
  lines.push('')
  lines.push(html)
  // Inline attachments
  for (const att of inlineAttachments) {
    lines.push(`--${boundary}`)
    lines.push(`Content-Type: ${att.contentType || 'application/octet-stream'}`)
    lines.push('Content-Transfer-Encoding: base64')
    lines.push(`Content-ID: <${att.cid}>`)
    lines.push(`Content-Disposition: inline; filename="${att.filename || att.cid}"`)
    lines.push('')
    // Split base64 into lines <= 76 chars (RFC 2045)
    const b64 = att.base64 || ''
    for (let i = 0; i < b64.length; i += 76) {
      lines.push(b64.slice(i, i + 76))
    }
    lines.push('')
  }
  lines.push(`--${boundary}--`)

  const raw = lines.join('\n')
  return Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Force <img> tags that carry data-cid to reference src="cid:<cid>"
function forceCidSrcForDescriptors(html, descriptors) {
  if (!html || !descriptors || descriptors.length === 0) return html
  let out = html
  for (const d of descriptors) {
    const cid = d.cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // escape for regex
    const tagRegex = new RegExp(`<img([^>]*data-cid="${cid}"[^>]*)>`, 'gi')
    out = out.replace(tagRegex, (full, attrs) => {
      // Replace any existing src with cid or inject if missing
      if (/\bsrc\s*=\s*"[^"]*"/i.test(attrs)) {
        attrs = attrs.replace(/\bsrc\s*=\s*"[^"]*"/i, `src="cid:${d.cid}"`)
      } else {
        attrs = ` src="cid:${d.cid}"` + attrs
      }
      return `<img${attrs}>`
    })
  }
  return out
}

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
    let { to, subject, message, type, isHtml, messageId, customerId, includeConfirmation } = JSON.parse(event.body || '{}')

    if (!to || !subject || !message) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing required fields: to, subject, message' })
      }
    }

    // Parse INCLUDE_CONFIRMATION flag from message content (temporary workaround)
    if (message.includes('|INCLUDE_CONFIRMATION:true|')) {
      includeConfirmation = true;
      message = message.replace(/\|INCLUDE_CONFIRMATION:true\|/g, '').trim();
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

    // Create response tokens if appointment confirmation is requested
    let confirmToken = null;
    let rescheduleToken = null;
    
    if (includeConfirmation && messageId && customerId) {
      const tokens = await createResponseTokens(messageId, customerId);
      confirmToken = tokens.confirmToken;
      rescheduleToken = tokens.rescheduleToken;
    }

    // Create tracking token for email open detection
    let trackingToken = null;
    if (messageId && customerId) {
      trackingToken = await createTrackingToken(messageId, customerId);
    }

    // Create email message
    const emailSubject = subject || 'Mensaje desde Casmara CRM';
    const fromEmail = process.env.GMAIL_FROM_EMAIL || 'rosariog.almenglo@gmail.com';
    
    let emailContent;
    
    if (isHtml) {
      // Use custom HTML content directly, but add confirmation buttons if requested
      emailContent = message;
      
      if (includeConfirmation && confirmToken && rescheduleToken) {
        const baseUrl = process.env.URL || 'https://casmara-charo.netlify.app';
        const confirmationButtons = generateConfirmationButtons(baseUrl, confirmToken, rescheduleToken);
        
        // Try to insert before closing body or div tag, or append at the end
        if (emailContent.includes('</body>')) {
          emailContent = emailContent.replace('</body>', confirmationButtons + '</body>');
        } else if (emailContent.includes('</div>')) {
          emailContent = emailContent.replace(/(<\/div>)(?!.*<\/div>)/, confirmationButtons + '$1');
        } else {
          emailContent += confirmationButtons;
        }
      }
      
      // Add tracking pixel to HTML emails
      if (trackingToken) {
        const trackingPixel = `<img src="${process.env.URL || 'https://casmara-charo.netlify.app'}/.netlify/functions/email-tracking?token=${trackingToken}" style="width:1px;height:1px;border:0;" alt="" />`;
        
        if (emailContent.includes('</body>')) {
          emailContent = emailContent.replace('</body>', trackingPixel + '</body>');
        } else {
          emailContent += trackingPixel;
        }
      }
    } else {
      // Use default template for plain text
      emailContent = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #4285f4; color: white; padding: 20px; text-align: center;">
          <h2>CASMARA</h2>
          <p style="margin: 5px 0 0 0; font-size: 14px;">Sistema de Notificaciones de Visita</p>
        </div>
        <div style="padding: 20px; background: #f9f9f9;">
          <div style="background: white; padding: 20px; border-radius: 8px;">
            ${message.replace(/\n/g, '<br>')}
          </div>
          ${includeConfirmation && confirmToken && rescheduleToken ? generateConfirmationButtons(process.env.URL || 'https://casmara-charo.netlify.app', confirmToken, rescheduleToken) : ''}
        </div>
        <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
          <p>Este mensaje fue enviado desde Casmara CRM | Asesora comercial: Charo | Tel: +34 646 11 67 04</p>
          ${trackingToken ? `<img src="${process.env.URL || 'https://casmara-charo.netlify.app'}/.netlify/functions/email-tracking?token=${trackingToken}" style="width:1px;height:1px;border:0;" alt="" />` : ''}
        </div>
      </div>`;
    }

    // Check for inline CID images referencing Supabase Storage
    let inlineAttachments = []
    if (isHtml && supabase) {
      const descriptors = extractCidDescriptors(emailContent)
      // Ensure HTML references cid: for inline parts
      if (descriptors.length > 0) {
        emailContent = forceCidSrcForDescriptors(emailContent, descriptors)
      }
      // Download and build base64 attachments
      for (const d of descriptors) {
        const base64 = await downloadFromStorageBase64(supabase, d.bucket, d.path)
        if (base64) inlineAttachments.push({ ...d, base64 })
      }
    }

    // Build raw MIME email with or without inline attachments
    const encodedMessage = buildRawEmail({
      fromEmail,
      to,
      subject: emailSubject,
      html: emailContent,
      inlineAttachments
    })

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

// Generate confirmation buttons for HTML emails
function generateConfirmationButtons(baseUrl, confirmToken, rescheduleToken) {
  return `
    <div style="background: #f8f9fa; padding: 30px; margin: 30px 0; border-radius: 12px; text-align: center; border: 2px solid #e9ecef;">
      <h3 style="color: #495057; margin-bottom: 20px; font-size: 18px;">Pendiente de Confirmación</h3>
      
      <div style="margin: 25px 0;">
        <a href="${baseUrl}/.netlify/functions/appointment-response?token=${confirmToken}" 
           style="display: inline-block; background: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 0 10px; font-weight: bold; font-size: 16px;">
          ✅ Confirmar Cita
        </a>
        <a href="${baseUrl}/.netlify/functions/appointment-response?token=${rescheduleToken}" 
           style="display: inline-block; background: #17a2b8; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 0 10px; font-weight: bold; font-size: 16px;">
          📅 Reprogramar
        </a>
      </div>
      
      <p style="color: #6c757d; font-size: 14px; margin-top: 20px;">
        Haga clic en uno de los botones para confirmar su cita o solicitar una reprogramación.
      </p>
    </div>
    
    <div style="background: #e3f2fd; padding: 25px; margin: 20px 0; border-radius: 8px; text-align: center;">
      <h4 style="color: #1976d2; margin-bottom: 15px;">¿Necesita contactar con Charo?</h4>
      <p style="color: #424242; margin-bottom: 15px; line-height: 1.5;">
        Si tiene alguna pregunta o necesita hacer algún cambio, no dude en contactar directamente con Charo, 
        su asesora comercial de Casmara. Está disponible para ayudarle con cualquier consulta sobre la demostración del Beauty Advisor.
      </p>
      
      <div style="margin: 15px 0;">
        <div style="margin: 8px 0; color: #1976d2; font-weight: bold;">📞 +34 646 11 67 04</div>
        <div style="margin: 8px 0; color: #1976d2; font-weight: bold;">✉️ rosariog.almenglo@gmail.com</div>
        <div style="margin: 8px 0; color: #1976d2; font-weight: bold;">💬 WhatsApp Charo</div>
      </div>
      
      <div style="margin-top: 25px; padding-top: 20px; border-top: 1px solid #bbdefb; color: #666; font-size: 12px;">
        © 2025 Casmara. Todos los derechos reservados.<br>
        Asesora comercial: Charo | Tel: +34 646 11 67 04
      </div>
    </div>
  `;
}

// Generate appointment confirmation section for plain text emails
function generateAppointmentConfirmationSection(confirmToken, rescheduleToken) {
  const baseUrl = process.env.URL || 'https://casmara-charo.netlify.app';
  
  return `
    <div style="background: #f8f9fa; padding: 25px; margin: 20px 0; border-radius: 8px; text-align: center; border: 2px solid #e9ecef;">
      <h3 style="color: #495057; margin-bottom: 20px;">Pendiente de Confirmación</h3>
      
      <div style="margin: 20px 0;">
        <a href="${baseUrl}/.netlify/functions/appointment-response?token=${confirmToken}" 
           style="display: inline-block; background: #28a745; color: white; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin: 5px; font-weight: bold;">
          ✅ Confirmar Cita
        </a>
        <a href="${baseUrl}/.netlify/functions/appointment-response?token=${rescheduleToken}" 
           style="display: inline-block; background: #17a2b8; color: white; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin: 5px; font-weight: bold;">
          📅 Reprogramar
        </a>
      </div>
    </div>
    
    <div style="background: #e3f2fd; padding: 20px; margin: 15px 0; border-radius: 8px; text-align: center;">
      <h4 style="color: #1976d2; margin-bottom: 10px;">¿Necesita contactar con Charo?</h4>
      <p style="color: #424242; margin-bottom: 15px; font-size: 14px;">
        Si tiene alguna pregunta o necesita hacer algún cambio, no dude en contactar directamente con Charo, 
        su asesora comercial de Casmara. Está disponible para ayudarle con cualquier consulta sobre la demostración del Beauty Advisor.
      </p>
      
      <div style="margin: 10px 0; color: #1976d2;">
        <div>📞 +34 646 11 67 04</div>
        <div>✉️ rosariog.almenglo@gmail.com</div>
        <div>💬 WhatsApp Charo</div>
      </div>
      
      <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #bbdefb; color: #666; font-size: 11px;">
        © 2025 Casmara. Todos los derechos reservados.<br>
        Asesora comercial: Charo | Tel: +34 646 11 67 04
      </div>
    </div>
  `;
}

