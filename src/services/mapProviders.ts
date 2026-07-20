export type MapTileProvider = {
  url: string
  attribution: string
  maxZoom: number
}

export type ExternalNavigationProvider = {
  googleMaps: (lat: number, lng: number) => string
  appleMaps: (lat: number, lng: number) => string
  waze: (lat: number, lng: number) => string
  openStreetMap: (lat: number, lng: number) => string
}

const env = import.meta.env as Record<string, string | undefined>

// Values remain replaceable through Netlify/Vite environment variables. The
// defaults are intentionally low-volume OSM-compatible public endpoints.
export const mapTileProvider: MapTileProvider = {
  url: env.VITE_MAP_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution:
    env.VITE_MAP_TILE_ATTRIBUTION ||
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: Number(env.VITE_MAP_TILE_MAX_ZOOM || 19),
}

export const externalNavigationProvider: ExternalNavigationProvider = {
  googleMaps: (lat, lng) =>
    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`,
  appleMaps: (lat, lng) =>
    `https://maps.apple.com/?daddr=${encodeURIComponent(`${lat},${lng}`)}&dirflg=d`,
  waze: (lat, lng) => `https://waze.com/ul?ll=${encodeURIComponent(`${lat},${lng}`)}&navigate=yes`,
  openStreetMap: (lat, lng) =>
    `https://www.openstreetmap.org/?mlat=${encodeURIComponent(String(lat))}&mlon=${encodeURIComponent(String(lng))}#map=18/${lat}/${lng}`,
}

export const isAppleDevice = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
