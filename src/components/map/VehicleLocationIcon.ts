import L from 'leaflet'

export type VehicleLocationIconOptions = {
  heading?: number | null
  accuracy?: number | null
  isMoving?: boolean
}

export type LocationAccuracyState = 'precise' | 'approximate' | 'weak' | 'unknown'

const getMarkerSize = () => {
  const compact = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  return compact ? 44 : 48
}

export const getLocationAccuracyState = (accuracy?: number | null): LocationAccuracyState => {
  if (!Number.isFinite(accuracy)) return 'unknown'
  if ((accuracy as number) <= 20) return 'precise'
  if ((accuracy as number) <= 100) return 'approximate'
  return 'weak'
}

export const getLocationAccuracyLabel = (accuracy?: number | null) => {
  switch (getLocationAccuracyState(accuracy)) {
    case 'precise':
      return 'Ubicación precisa'
    case 'approximate':
      return 'Precisión aproximada'
    case 'weak':
      return 'Señal GPS débil'
    default:
      return 'Precisión GPS no disponible'
  }
}

export const createVehicleLocationIcon = ({
  heading = null,
  accuracy = null,
  isMoving = false,
}: VehicleLocationIconOptions) => {
  const size = getMarkerSize()
  const accuracyState = getLocationAccuracyState(accuracy)
  const rotation = Number.isFinite(heading) ? Number(heading) : 0

  return L.divIcon({
    className: 'vehicle-location-marker-icon',
    html: `<div class="vehicle-location-marker vehicle-location-marker--${accuracyState}${isMoving ? ' vehicle-location-marker--moving' : ''}" aria-hidden="true"><div class="vehicle-location-marker__accuracy"></div><div class="vehicle-location-marker__pulse"></div><div class="vehicle-location-marker__beam" style="--vehicle-heading:${rotation}deg"></div><div class="vehicle-location-marker__dot"></div></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2)],
  })
}
