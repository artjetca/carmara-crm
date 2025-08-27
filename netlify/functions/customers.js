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

      const normalFields = { ...updateData };
      delete normalFields.num;
      delete normalFields.numero; // 避免與特殊處理重複
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

      const warnings = [];

      // 單獨處理 postal_code（若提供）
      if (Object.prototype.hasOwnProperty.call(updateData, 'postal_code')) {
        const { error: pcErr } = await admin
          .from('customers')
          .update({ postal_code: updateData.postal_code })
          .eq('id', id);
        if (pcErr) {
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ success: false, error: pcErr.message })
          };
        }
      }

      // 單獨處理 Número：先嘗試 num，若欄位不存在則改寫 numero
      if (Object.prototype.hasOwnProperty.call(updateData, 'num')) {
        const tryNum = await admin
          .from('customers')
          .update({ num: updateData.num })
          .eq('id', id);
        if (tryNum.error) {
          const msg = (tryNum.error.message || '').toLowerCase();
          const isMissingNum = msg.includes("'num' column") || (msg.includes('num') && msg.includes('schema'));
          if (isMissingNum) {
            const tryNumero = await admin
              .from('customers')
              .update({ numero: updateData.num })
              .eq('id', id);
            if (tryNumero.error) {
              const m2 = (tryNumero.error.message || '').toLowerCase();
              const isMissingNumero = m2.includes("'numero' column") || (m2.includes('numero') && m2.includes('schema'));
              if (isMissingNumero) {
                warnings.push('Número 未持久化：schema cache 未暴露 num/numero，其他欄位已保存');
              } else {
                return {
                  statusCode: 500,
                  headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                  },
                  body: JSON.stringify({ success: false, error: tryNumero.error.message })
                };
              }
            }
          } else {
            return {
              statusCode: 500,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              },
              body: JSON.stringify({ success: false, error: tryNum.error.message })
            };
          }
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
        body: JSON.stringify({ success: true, data: finalRow, warnings })
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
