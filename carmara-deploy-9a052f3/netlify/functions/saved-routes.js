const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables:', { supabaseUrl: !!supabaseUrl, supabaseKey: !!supabaseKey })
}

const supabase = createClient(supabaseUrl, supabaseKey)

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  }

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    }
  }

  try {
    const authHeader = event.headers.authorization
    if (!authHeader) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'No authorization header' })
      }
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid token' })
      }
    }

    const method = event.httpMethod
    const body = event.body ? JSON.parse(event.body) : {}

    switch (method) {
      case 'GET':
        // Get all saved routes for user
        const { data: routes, error: fetchError } = await supabase
          .from('saved_routes')
          .select('*')
          .eq('created_by', user.id)
          .order('created_at', { ascending: false })

        if (fetchError) {
          console.error('Error fetching routes:', fetchError)
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: fetchError.message })
          }
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            success: true, 
            data: routes || []
          })
        }

      case 'POST':
        // Create new saved route
        const { name, route_date, route_time, customers, total_distance, total_duration } = body

        if (!name || !customers) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Name and customers are required' })
          }
        }

        const { data: newRoute, error: insertError } = await supabase
          .from('saved_routes')
          .insert({
            name,
            route_date: route_date || null,
            route_time: route_time || null,
            customers,
            total_distance: total_distance || 0,
            total_duration: total_duration || 0,
            created_by: user.id
          })
          .select()
          .single()

        if (insertError) {
          console.error('Error inserting route:', insertError)
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: insertError.message })
          }
        }

        return {
          statusCode: 201,
          headers,
          body: JSON.stringify({ 
            success: true, 
            data: newRoute 
          })
        }

      case 'PUT':
        // Update existing route
        const { id, ...updateData } = body

        if (!id) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Route ID is required' })
          }
        }

        const { data: updatedRoute, error: updateError } = await supabase
          .from('saved_routes')
          .update(updateData)
          .eq('id', id)
          .eq('created_by', user.id)
          .select()
          .single()

        if (updateError) {
          console.error('Error updating route:', updateError)
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: updateError.message })
          }
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            success: true, 
            data: updatedRoute 
          })
        }

      case 'DELETE':
        // Delete route
        const routeId = event.path.split('/').pop()

        if (!routeId) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Route ID is required' })
          }
        }

        const { error: deleteError } = await supabase
          .from('saved_routes')
          .delete()
          .eq('id', routeId)
          .eq('created_by', user.id)

        if (deleteError) {
          console.error('Error deleting route:', deleteError)
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: deleteError.message })
          }
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true })
        }

      default:
        return {
          statusCode: 405,
          headers,
          body: JSON.stringify({ error: 'Method not allowed' })
        }
    }

  } catch (error) {
    console.error('Saved routes function error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    }
  }
}
