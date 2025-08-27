const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://aotpcnwjjpkzxnhvmcvb.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
      },
      body: ''
    };
  }

  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(event.httpMethod)) {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ success: false, error: 'Method not allowed' })
    };
  }

  try {
    if (!serviceRoleKey) {
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          success: false, 
          error: 'Server missing service role key' 
        })
      };
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, { 
      auth: { autoRefreshToken: false, persistSession: false } 
    });

    // Handle GET request - fetch all customers
    if (event.httpMethod === 'GET') {
      const { data, error } = await admin
        .from('customers')
        .select('*')
        .order('name');

      if (error) {
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({ success: false, error: error.message })
        };
      }

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ success: true, data })
      };
    }

    // Handle POST request - create new customer
    if (event.httpMethod === 'POST') {
      const requestBody = JSON.parse(event.body || '{}');
      
      const { data, error } = await admin
        .from('customers')
        .insert(requestBody)
        .select()
        .single();

      if (error) {
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({ success: false, error: error.message })
        };
      }

      return {
        statusCode: 201,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ success: true, data })
      };
    }

    // Handle PUT/PATCH request - update customer
    if (event.httpMethod === 'PUT' || event.httpMethod === 'PATCH') {
      const requestBody = JSON.parse(event.body || '{}');
      const { id, ...updateData } = requestBody;

      if (!id) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({ success: false, error: 'Customer ID is required' })
        };
      }

      // 特殊欄位與一般欄位分開更新，避免 RPC 與快取問題
      const specialFields = {};
      if (Object.prototype.hasOwnProperty.call(updateData, 'num')) {
        specialFields.num = updateData.num;
      }
      if (Object.prototype.hasOwnProperty.call(updateData, 'postal_code')) {
        specialFields.postal_code = updateData.postal_code;
      }

      const normalFields = { ...updateData };
      delete normalFields.num;
      delete normalFields.numero;
      delete normalFields.customer_number;
      delete normalFields.postal_code;

      // 執行更新，優先更新一般欄位，再更新特殊欄位（或反之皆可）
      if (Object.keys(normalFields).length > 0) {
        const { error: upErr } = await admin
          .from('customers')
          .update(normalFields)
          .eq('id', id);
        if (upErr) {
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ success: false, error: upErr.message })
          };
        }
      }

      if (Object.keys(specialFields).length > 0) {
        const { error: spErr } = await admin
          .from('customers')
          .update(specialFields)
          .eq('id', id);
        if (spErr) {
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ success: false, error: spErr.message })
          };
        }
      }

      // 回傳最新資料列
      const { data: finalRow, error: selErr } = await admin
        .from('customers')
        .select('*')
        .eq('id', id)
        .single();

      if (selErr) {
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({ success: false, error: selErr.message })
        };
      }

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ success: true, data: finalRow })
      };
    }

    // Handle DELETE request - delete customer
    if (event.httpMethod === 'DELETE') {
      const requestBody = JSON.parse(event.body || '{}');
      const { id } = requestBody;

      if (!id) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({ success: false, error: 'Customer ID is required' })
        };
      }

      const { error } = await admin
        .from('customers')
        .delete()
        .eq('id', id);

      if (error) {
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({ success: false, error: error.message })
        };
      }

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ success: true, message: 'Customer deleted successfully' })
      };
    }

  } catch (e) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        success: false, 
        error: e?.message || 'Unexpected server error' 
      })
    };
  }
};
