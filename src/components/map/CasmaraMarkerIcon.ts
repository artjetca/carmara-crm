import L from 'leaflet'

export type CasmaraMarkerIconOptions = {
  accuracy: 'precise' | 'approximate'
  tone?: 'customer' | 'prospect'
  selected?: boolean
  scheduled?: boolean
  overdue?: boolean
  followUp?: boolean
}

const getMarkerSize = () => {
  const compact = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  return compact ? { width: 36, height: 46 } : { width: 38, height: 48 }
}

export const createCasmaraMarkerIcon = ({
  accuracy,
  tone = 'customer',
  selected = false,
  scheduled = false,
  overdue = false,
  followUp = false,
}: CasmaraMarkerIconOptions) => {
  const { width, height } = getMarkerSize()
  const stateClasses = [
    `casmara-marker--${accuracy}`,
    `casmara-marker--${tone}`,
    selected && 'casmara-marker--selected',
    overdue && 'casmara-marker--overdue',
    !overdue && scheduled && 'casmara-marker--scheduled',
    !overdue && !scheduled && followUp && 'casmara-marker--follow-up',
  ].filter(Boolean).join(' ')

  return L.divIcon({
    className: 'casmara-marker-icon',
    html: `<div class="casmara-marker ${stateClasses}" aria-hidden="true"><div class="casmara-marker__pin"><img src="/assets/casmara-map-pin.png" alt="" class="casmara-marker__image" /></div></div>`,
    iconSize: [width, height],
    iconAnchor: [width / 2, height],
    popupAnchor: [0, -height],
  })
}
