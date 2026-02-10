const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables')
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  }

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    }
  }

  try {
    const method = event.httpMethod

    if (method === 'GET') {
      // Get all visits
      const { data, error } = await supabase
        .from('visits')
        .select(`
          *,
          customer:customers(*)
        `)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Supabase error:', error)
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ 
            success: false, 
            error: error.message || 'Database error' 
          })
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          data: data || [] 
        })
      }
    }

    if (method === 'POST') {
      // Create new visit
      const body = JSON.parse(event.body || '{}')
      
      if (!body.customer_id || !body.scheduled_at) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            success: false, 
            error: 'customer_id and scheduled_at are required' 
          })
        }
      }

      const { data, error } = await supabase
        .from('visits')
        .insert(body)
        .select(`
          *,
          customer:customers(*)
        `)
        .single()

      if (error) {
        console.error('Supabase error:', error)
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ 
            success: false, 
            error: error.message || 'Database error' 
          })
        }
      }

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({ 
          success: true, 
          data 
        })
      }
    }

    if (method === 'PUT') {
      // Update visit
      const body = JSON.parse(event.body || '{}')
      const { id, ...updateData } = body
      
      if (!id) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            success: false, 
            error: 'Visit ID is required' 
          })
        }
      }

      const { data, error } = await supabase
        .from('visits')
        .update(updateData)
        .eq('id', id)
        .select(`
          *,
          customer:customers(*)
        `)
        .single()

      if (error) {
        console.error('Supabase error:', error)
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ 
            success: false, 
            error: error.message || 'Database error' 
          })
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          data 
        })
      }
    }

    if (method === 'DELETE') {
      // Delete visit
      const body = JSON.parse(event.body || '{}')
      const { id } = body
      
      if (!id) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            success: false, 
            error: 'Visit ID is required' 
          })
        }
      }

      const { error } = await supabase
        .from('visits')
        .delete()
        .eq('id', id)

      if (error) {
        console.error('Supabase error:', error)
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ 
            success: false, 
            error: error.message || 'Database error' 
          })
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          message: 'Visit deleted successfully' 
        })
      }
    }

    // Method not allowed
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ 
        success: false, 
        error: 'Method not allowed' 
      })
    }

  } catch (error) {
    console.error('Function error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false, 
        error: 'Internal server error' 
      })
    }
  }
}
