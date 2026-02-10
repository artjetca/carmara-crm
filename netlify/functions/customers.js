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
      const numeroIncoming = Object.prototype.hasOwnProperty.call(requestBody, 'num')
        ? requestBody.num
        : (Object.prototype.hasOwnProperty.call(requestBody, 'numero') ? requestBody.numero : undefined);

      // Avoid inserting num/numero directly to prevent schema cache errors
      const insertBody = { ...requestBody };
      delete insertBody.num;
      delete insertBody.numero;
      
      // Handle CP field mapping - ensure cp maps to postal_code for database
      if (insertBody.cp) {
        insertBody.postal_code = insertBody.cp;
        delete insertBody.cp; // Remove cp to avoid schema errors
      }
      // 城市處理：若值為省份名稱則正規化，否則保留原城市（允許任意 municipio）
      if (Object.prototype.hasOwnProperty.call(insertBody, 'city')) {
        const norm = String(insertBody.city || '')
          .trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
        if (norm === 'huelva') insertBody.city = 'Huelva'
        else if (norm === 'cadiz') insertBody.city = 'Cádiz'
        // 其他城市名稱（municipios）直接保留
      }
      // 依據資料庫約束清理電話欄位：9位數且以6-9開頭，其餘設為 null
      const sanitizePhone = (val) => {
        if (val === undefined || val === null) return null;
        const digits = String(val).replace(/\D+/g, '');
        if (digits.length === 0) return null;
        return /^[6789][0-9]{8}$/.test(digits) ? digits : null;
      };
      
      if (Object.prototype.hasOwnProperty.call(insertBody, 'phone')) {
        insertBody.phone = sanitizePhone(insertBody.phone);
      }
      if (Object.prototype.hasOwnProperty.call(insertBody, 'mobile_phone')) {
        insertBody.mobile_phone = sanitizePhone(insertBody.mobile_phone);
      }

      // 第一次嘗試插入（含 created_by 若有）
      let { data: created, error: insErr } = await admin
        .from('customers')
        .insert(insertBody)
        .select()
        .single();

      // 若因 created_by 外鍵失敗，移除 created_by 後重試
      if (insErr) {
        const msg = (insErr.message || '').toLowerCase();
        const hasCreatedBy = Object.prototype.hasOwnProperty.call(insertBody, 'created_by');
        const isFK = msg.includes('foreign key') || msg.includes('violates foreign key') || msg.includes('references');
        if (hasCreatedBy && isFK) {
          const retryBody = { ...insertBody };
          delete retryBody.created_by;
          const retry = await admin
            .from('customers')
            .insert(retryBody)
            .select()
            .single();
          created = retry.data;
          insErr = retry.error || null;
        }
      }

      if (insErr) {
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({ success: false, error: insErr.message })
        };
      }

      const warnings = [];
      if (created && created.id && typeof numeroIncoming !== 'undefined' && numeroIncoming !== null) {
        // Try write to num first
        const tryNum = await admin
          .from('customers')
          .update({ num: numeroIncoming })
          .eq('id', created.id);
        if (tryNum.error) {
          const msg = (tryNum.error.message || '').toLowerCase();
          const isMissingNum = msg.includes("'num' column") || (msg.includes('num') && msg.includes('schema'));
          if (isMissingNum) {
            const tryNumero = await admin
              .from('customers')
              .update({ numero: numeroIncoming })
              .eq('id', created.id);
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

      // Reselect final row
      const { data: finalRow, error: selErr } = await admin
        .from('customers')
        .select('*')
        .eq('id', created.id)
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
        statusCode: 201,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ success: true, data: finalRow, warnings })
      };
    }

    // Handle PUT/PATCH request - update customer
    if (event.httpMethod === 'PUT' || event.httpMethod === 'PATCH') {
      const requestBody = JSON.parse(event.body || '{}');
      const { id, ...updateData } = requestBody;

      // 城市處理：若值為省份名稱則正規化，否則保留原城市（允許任意 municipio）
      if (Object.prototype.hasOwnProperty.call(updateData, 'city')) {
        const norm = String(updateData.city || '')
          .trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
        if (norm === 'huelva') updateData.city = 'Huelva'
        else if (norm === 'cadiz') updateData.city = 'Cádiz'
        // 其他城市名稱（municipios）直接保留
      }
      // 清理電話欄位以符合 CHECK 限制
      const sanitizePhoneU = (val) => {
        if (val === undefined || val === null) return null;
        const digits = String(val).replace(/\D+/g, '');
        if (digits.length === 0) return null;
        return /^[6789][0-9]{8}$/.test(digits) ? digits : null;
      };
      
      if (Object.prototype.hasOwnProperty.call(updateData, 'phone')) {
        updateData.phone = sanitizePhoneU(updateData.phone);
      }
      if (Object.prototype.hasOwnProperty.call(updateData, 'mobile_phone')) {
        updateData.mobile_phone = sanitizePhoneU(updateData.mobile_phone);
      }

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

      // Handle CP field mapping for updates - ensure cp maps to postal_code for database
      if (updateData.cp) {
        updateData.postal_code = updateData.cp;
        delete updateData.cp; // Remove cp to avoid schema errors
      }

      const normalFields = { ...updateData };
      delete normalFields.num;
      delete normalFields.numero; // 避免與特殊處理重複
      delete normalFields.customer_number;

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
