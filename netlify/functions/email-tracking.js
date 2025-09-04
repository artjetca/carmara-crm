const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Imagen pixel 1x1 transparente en formato PNG (base64)
const TRACKING_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

exports.handler = async (event, context) => {
  // Solo permitir GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: 'Method not allowed'
    };
  }

  const { token } = event.queryStringParameters || {};
  
  if (!token) {
    // Devolver pixel aunque no haya token para no romper el email
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      body: TRACKING_PIXEL.toString('base64'),
      isBase64Encoded: true
    };
  }

  try {
    // Obtener información del cliente
    const clientIP = event.headers['x-forwarded-for'] || event.headers['x-real-ip'] || 'unknown';
    const userAgent = event.headers['user-agent'] || 'unknown';

    // Buscar el registro de tracking
    const { data: trackingData, error: findError } = await supabase
      .from('email_tracking')
      .select('id, opened_at')
      .eq('tracking_token', token)
      .single();

    if (findError && findError.code !== 'PGRST116') {
      console.error('Error finding tracking record:', findError);
    } else if (trackingData && !trackingData.opened_at) {
      // Solo actualizar si no se ha abierto antes (primera apertura)
      const { error: updateError } = await supabase
        .from('email_tracking')
        .update({
          opened_at: new Date().toISOString(),
          ip_address: clientIP,
          user_agent: userAgent
        })
        .eq('id', trackingData.id);

      if (updateError) {
        console.error('Error updating tracking record:', updateError);
      } else {
        console.log(`Email opened: token=${token}, ip=${clientIP}`);
      }
    }

  } catch (error) {
    console.error('Email tracking error:', error);
  }

  // Siempre devolver el pixel, independientemente de errores
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Access-Control-Allow-Origin': '*'
    },
    body: TRACKING_PIXEL.toString('base64'),
    isBase64Encoded: true
  };
};
