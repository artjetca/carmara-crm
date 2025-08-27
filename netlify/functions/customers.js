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

      // 先處理需要透過 RPC 的欄位（避免 schema cache 問題）
      const numToSet = requestBody.num ?? requestBody.numero ?? null;
      const postalToSet = requestBody.postal_code ?? null;

      if (numToSet !== null || postalToSet !== null) {
        const { error: rpcError } = await admin
          .rpc('update_customer_fields', {
            p_id: id,
            p_num: numToSet ?? null,
            p_postal_code: postalToSet ?? null,
          });

        if (rpcError) {
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ success: false, error: rpcError.message })
          };
        }
      }

      // 排除所有可能有 schema cache 問題的欄位，其他欄位以正常 UPDATE 執行
      const safeUpdateData = { ...updateData };
      delete safeUpdateData.num;
      delete safeUpdateData.customer_number;
      delete safeUpdateData.numero;
      delete safeUpdateData.postal_code;

      let updatedRow = null;
      if (Object.keys(safeUpdateData).length > 0) {
        const { data, error } = await admin
          .from('customers')
          .update(safeUpdateData)
          .eq('id', id)
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
        updatedRow = data;
      }

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ success: true, data: updatedRow })
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
