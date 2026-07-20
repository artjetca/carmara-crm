const DEFAULT_NOMINATIM_URL = 'https://nominatim.openstreetmap.org'
const DEFAULT_OSRM_URL = 'https://router.project-osrm.org'

const getMapProviderConfig = () => ({
  mapProvider: process.env.MAP_PROVIDER || 'leaflet',
  tileUrl: process.env.MAP_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  tileAttribution:
    process.env.MAP_TILE_ATTRIBUTION ||
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  tileMaxZoom: Number(process.env.MAP_TILE_MAX_ZOOM || 19),
  geocodingProvider: process.env.GEOCODING_PROVIDER || 'nominatim',
  nominatimBaseUrl: (process.env.NOMINATIM_BASE_URL || DEFAULT_NOMINATIM_URL).replace(/\/$/, ''),
  nominatimUserAgent: process.env.NOMINATIM_USER_AGENT || 'CASMARA-CRM/1.0',
  nominatimEmail: process.env.NOMINATIM_EMAIL || '',
  geocodingIntervalMs: Math.max(1000, Number(process.env.GEOCODING_REQUEST_INTERVAL_MS || 1100)),
  routingProvider: process.env.ROUTING_PROVIDER || 'osrm',
  osrmBaseUrl: (process.env.OSRM_BASE_URL || DEFAULT_OSRM_URL).replace(/\/$/, ''),
  prospectProvider: process.env.PROSPECT_PROVIDER || 'osm',
  aiProvider: process.env.AI_PROVIDER || 'rules',
  externalNavigationEnabled: process.env.EXTERNAL_NAVIGATION_ENABLED !== 'false',
})

module.exports = { getMapProviderConfig }
