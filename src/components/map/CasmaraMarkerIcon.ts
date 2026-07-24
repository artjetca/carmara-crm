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

const getMarkerHtml = (tone: 'customer' | 'prospect', accuracy: 'precise' | 'approximate') => {
  if (tone === 'customer') {
    return '<img src="/assets/casmara-map-pin.png" alt="" class="casmara-marker__image" />'
  }

  const accuracyRing = accuracy === 'approximate'
    ? '<circle cx="19" cy="18" r="15" fill="none" stroke="#f59e0b" stroke-width="2" stroke-dasharray="3 2" />'
    : ''

  return `<svg viewBox="0 0 38 48" width="38" height="48" class="casmara-marker__potential" aria-hidden="true">${accuracyRing}<path d="M19 1C9.1 1 1 9 1 18.9c0 13.1 18 28.1 18 28.1S37 32 37 18.9C37 9 28.9 1 19 1Z" fill="#ec4899" stroke="#fff" stroke-width="2"/><circle cx="19" cy="18" r="9.5" fill="#fff"/><circle cx="14.6" cy="16.2" r="2.2" fill="#ec4899"/><circle cx="23.4" cy="16.2" r="2.2" fill="#ec4899"/><circle cx="19" cy="13.5" r="2.5" fill="#ec4899"/><path d="M10.8 23.3c.5-2.3 2-3.7 3.8-3.7 1.8 0 3.2 1.4 3.7 3.7M16.1 23.6c.5-2.8 2.1-4.5 4.1-4.5s3.6 1.7 4.1 4.5" fill="none" stroke="#ec4899" stroke-width="1.7" stroke-linecap="round"/></svg>`
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
    html: `<div class="casmara-marker ${stateClasses}" aria-hidden="true"><div class="casmara-marker__pin">${getMarkerHtml(tone, accuracy)}</div></div>`,
    iconSize: [width, height],
    iconAnchor: [width / 2, height],
    popupAnchor: [0, -height],
  })
}
