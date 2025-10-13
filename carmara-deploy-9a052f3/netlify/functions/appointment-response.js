const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Generate secure token for appointment response links
function generateResponseToken(messageId, customerId, responseType) {
  const data = `${messageId}-${customerId}-${responseType}-${Date.now()}`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
}

// Create response token when sending email
async function createResponseToken(messageId, customerId, responseType) {
  const token = generateResponseToken(messageId, customerId, responseType);
  
  const { data, error } = await supabase
    .from('appointment_responses')
    .insert({
      message_id: messageId,
      customer_id: customerId,
      response_token: token,
      response_type: responseType,
      responded_at: null // Will be set when customer responds
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating response token:', error);
    return null;
  }

  return token;
}

// Handle customer response to appointment confirmation
async function handleAppointmentResponse(token, clientIP, userAgent) {
  try {
    // Find the response record by token
    const { data: responseData, error: findError } = await supabase
      .from('appointment_responses')
      .select('*, customers(name, company), scheduled_messages(message)')
      .eq('response_token', token)
      .is('responded_at', null) // Only allow one response per token
      .single();

    if (findError || !responseData) {
      return {
        success: false,
        error: 'Token inválido o ya utilizado',
        status: 404
      };
    }

    // Update the response with customer action
    const { error: updateError } = await supabase
      .from('appointment_responses')
      .update({
        responded_at: new Date().toISOString(),
        customer_ip: clientIP,
        customer_user_agent: userAgent
      })
      .eq('id', responseData.id);

    if (updateError) {
      console.error('Error updating response:', updateError);
      return {
        success: false,
        error: 'Error interno del servidor',
        status: 500
      };
    }

    return {
      success: true,
      responseType: responseData.response_type,
      customerName: responseData.customers?.name || 'Cliente',
      customerCompany: responseData.customers?.company || '',
      message: responseData.scheduled_messages?.message || ''
    };
  } catch (error) {
    console.error('Error handling appointment response:', error);
    return {
      success: false,
      error: 'Error interno del servidor',
      status: 500
    };
  }
}

// Main handler
exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'CORS preflight' }),
    };
  }

  try {
    const path = event.path;
    const method = event.httpMethod;
    const query = event.queryStringParameters || {};
    
    // Get client info
    const clientIP = event.headers['x-forwarded-for'] || event.headers['x-real-ip'] || 'unknown';
    const userAgent = event.headers['user-agent'] || 'unknown';

    // Handle GET request for customer response confirmation
    if (method === 'GET' && query.token) {
      const result = await handleAppointmentResponse(query.token, clientIP, userAgent);
      
      if (!result.success) {
        return {
          statusCode: result.status || 400,
          headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
          body: generateErrorPage(result.error)
        };
      }

      // Generate success page
      const successPage = generateSuccessPage(result.responseType, result.customerName, result.customerCompany);
      
      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
        body: successPage
      };
    }

    // Handle POST request to create response tokens (for internal use)
    if (method === 'POST') {
      const body = event.body ? JSON.parse(event.body) : {};
      const { messageId, customerId, action } = body;

      if (!messageId || !customerId || !action) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Faltan parámetros requeridos' })
        };
      }

      if (!['confirm', 'reschedule'].includes(action)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Acción no válida' })
        };
      }

      const token = await createResponseToken(messageId, customerId, action);
      
      if (!token) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Error creando token de respuesta' })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          token,
          confirmUrl: `${process.env.URL}/.netlify/functions/appointment-response?token=${token}`
        })
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Método no permitido' })
    };

  } catch (error) {
    console.error('Appointment response error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Error interno del servidor' })
    };
  }
};

// Generate HTML success page
function generateSuccessPage(responseType, customerName, customerCompany) {
  const isConfirm = responseType === 'confirm';
  const title = isConfirm ? '¡Cita Confirmada!' : '¡Solicitud de Reprogramación Recibida!';
  const message = isConfirm 
    ? 'Su cita ha sido confirmada exitosamente. Recibirá un recordatorio antes de la fecha programada.'
    : 'Hemos recibido su solicitud de reprogramación. Charo se pondrá en contacto con usted pronto para coordinar una nueva fecha.';
  const icon = isConfirm ? '✅' : '📅';

  return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Casmara</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 15px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            text-align: center;
            max-width: 500px;
            width: 100%;
        }
        .icon {
            font-size: 4rem;
            margin-bottom: 20px;
        }
        h1 {
            color: #333;
            margin-bottom: 20px;
            font-size: 1.8rem;
        }
        .customer-info {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .message {
            color: #666;
            font-size: 1.1rem;
            margin-bottom: 30px;
        }
        .contact-info {
            background: #e3f2fd;
            padding: 20px;
            border-radius: 8px;
            margin-top: 30px;
        }
        .contact-info h3 {
            color: #1976d2;
            margin-bottom: 15px;
        }
        .contact-item {
            margin: 10px 0;
            font-size: 0.95rem;
        }
        .footer {
            margin-top: 30px;
            color: #999;
            font-size: 0.85rem;
        }
        .logo {
            font-weight: bold;
            color: #764ba2;
            font-size: 1.2rem;
            margin-bottom: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">CASMARA</div>
        <div class="icon">${icon}</div>
        <h1>${title}</h1>
        
        <div class="customer-info">
            <strong>${customerName}</strong>
            ${customerCompany ? `<br><small>${customerCompany}</small>` : ''}
        </div>
        
        <div class="message">${message}</div>
        
        <div class="contact-info">
            <h3>¿Necesita contactar con Charo?</h3>
            <p>Si tiene alguna pregunta o necesita hacer algún cambio, no dude en contactar directamente con Charo, su asesora comercial de Casmara.</p>
            
            <div class="contact-item">📞 <strong>+34 646 11 67 04</strong></div>
            <div class="contact-item">✉️ <strong>rosariog.almenglo@gmail.com</strong></div>
            <div class="contact-item">💬 <strong>WhatsApp Charo</strong></div>
        </div>
        
        <div class="footer">
            © 2025 Casmara. Todos los derechos reservados.<br>
            Asesora comercial: Charo | Tel: +34 646 11 67 04
        </div>
    </div>
</body>
</html>`;
}

// Generate HTML error page
function generateErrorPage(error) {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Error - Casmara</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 15px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            text-align: center;
            max-width: 500px;
            width: 100%;
        }
        .icon {
            font-size: 4rem;
            margin-bottom: 20px;
        }
        h1 {
            color: #d32f2f;
            margin-bottom: 20px;
        }
        .message {
            color: #666;
            font-size: 1.1rem;
            margin-bottom: 30px;
        }
        .contact-info {
            background: #f5f5f5;
            padding: 20px;
            border-radius: 8px;
            margin-top: 30px;
        }
        .logo {
            font-weight: bold;
            color: #764ba2;
            font-size: 1.2rem;
            margin-bottom: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">CASMARA</div>
        <div class="icon">❌</div>
        <h1>Error</h1>
        <div class="message">${error}</div>
        
        <div class="contact-info">
            <h3>¿Necesita ayuda?</h3>
            <p>Si necesita asistencia, contacte directamente con Charo:</p>
            <div>📞 <strong>+34 646 11 67 04</strong></div>
            <div>✉️ <strong>rosariog.almenglo@gmail.com</strong></div>
        </div>
    </div>
</body>
</html>`;
}

// Export function for creating response tokens (used by send-email function)
module.exports = { createResponseToken };
