exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, error: 'Method not allowed' })
    }
  }

  try {
    const { waypoints } = JSON.parse(event.body || '{}')

    if (!waypoints || !Array.isArray(waypoints) || waypoints.length < 2) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: 'At least 2 waypoints are required'
        })
      }
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      console.warn('[netlify distance] Google Maps API key missing. Checked env: GOOGLE_MAPS_API_KEY, VITE_GOOGLE_MAPS_API_KEY')
      return {
        statusCode: 500,
        body: JSON.stringify({
          success: false,
          error: 'Google Maps API key not configured'
        })
      }
    }
    if (process.env.NODE_ENV !== 'production') {
      const source = process.env.GOOGLE_MAPS_API_KEY
        ? 'GOOGLE_MAPS_API_KEY'
        : (process.env.VITE_GOOGLE_MAPS_API_KEY ? 'VITE_GOOGLE_MAPS_API_KEY' : 'none')
      console.log(`[netlify distance] Using Google Maps API key from ${source}; length=${String(apiKey).length}`)
    }

    const results = []
    let totalDistance = 0
    let totalDuration = 0

    // Calculate distance and duration for each segment
    for (let i = 0; i < waypoints.length - 1; i++) {
      const origin = waypoints[i]
      const destination = waypoints[i + 1]

      const response = await fetch(
        `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&mode=driving&language=es&key=${apiKey}`
      )

      const data = await response.json()

      if (data.status === 'OK' && data.rows?.[0]?.elements?.[0]?.status === 'OK') {
        const element = data.rows[0].elements[0]
        const distance = element.distance?.value || 0 // meters
        const duration = element.duration?.value || 0 // seconds

        results.push({
          from: origin,
          to: destination,
          distance: distance / 1000, // convert to km
          duration: duration / 60 // convert to minutes
        })

        totalDistance += distance / 1000
        totalDuration += duration / 60
      } else {
        results.push({
          from: origin,
          to: destination,
          distance: 0,
          duration: 0,
          error: data.rows?.[0]?.elements?.[0]?.status || 'Unknown error'
        })
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: {
          segments: results,
          totalDistance,
          totalDuration
        }
      })
    }
  } catch (error) {
    console.error('Distance calculation error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: 'Failed to calculate distances'
      })
    }
  }
}
