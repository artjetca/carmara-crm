import React, { useEffect, useMemo, useRef, useState } from 'react'
import L, { LatLngBoundsExpression, Map as LeafletMap, Marker as LeafletMarker } from 'leaflet'
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet'
import {
  AlertTriangle,
  Crosshair,
  ExternalLink,
  MapPin,
  Navigation,
  Phone,
  X,
} from 'lucide-react'
import 'leaflet/dist/leaflet.css'

import type { Customer } from '../../lib/supabase'
import {
  getCoordinateAuditForClient,
  normalizeGeocodeResults,
  sanitizeCoordinateCache,
  validateAndFixClientCoordinates,
  type ClientCoordinateAudit,
  type GeocodeCandidate,
} from './visitsGeocodeUtils'
import {
  formatDistanceAndTime,
  formatDistanceKm,
  deriveProvince,
  getCustomerPhone,
  getUserLocation,
  JEREZ_ORIGIN,
  refreshMapAndSidebarDistances,
  type DistanceAwareCity,
  type DistanceAwareClient,
  type DistanceOrigin,
  type MapCoordinates,
} from './visitsMapUtils'
import {
  getRouteTimeFromUserToClient,
  type RouteTimeEntry,
} from './visitsRoutingUtils'

type VisitsMapModalProps = {
  customers: Customer[]
  onClose: () => void
}

type LocationStatus = 'idle' | 'locating' | 'granted' | 'denied' | 'unavailable'
type OriginMode = 'fallback' | 'user'
type CoordinateCache = Record<string, ClientCoordinateAudit | MapCoordinates>

const STORAGE_KEY = 'carmara-communications-visits-map-coords-v2'
const GEOCODE_CONCURRENCY = 4
const GEOCODE_BATCH_SIZE = 12
const ROUTE_TIME_CONCURRENCY = 4
const PRIORITY_CITY_COUNT = 12

const formatMarkerBadge = (distance: number | null) =>
  distance === null ? '—' : distance.toFixed(1)

const fetchGeocodeCandidates = async (address: string): Promise<GeocodeCandidate[]> => {
  const response = await fetch('/api/geocode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  })

  if (!response.ok) {
    throw new Error(`Geocode request failed with ${response.status}`)
  }

  const payload = await response.json()
  if (!payload?.success) {
    throw new Error(payload?.error || 'Geocode request failed')
  }
  return normalizeGeocodeResults(payload)
}

const createOriginIcon = (label: string) =>
  L.divIcon({
    className: '',
    html: `
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;">
        <div style="width:40px;height:40px;border-radius:999px;background:#111827;color:#ffffff;border:3px solid #ffffff;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 8px 18px rgba(0,0,0,.28)">🏠</div>
        <div style="padding:2px 8px;border-radius:999px;background:#ffffff;border:1px solid rgba(15,23,42,.12);font-size:11px;font-weight:700;color:#111827;box-shadow:0 4px 12px rgba(15,23,42,.16);white-space:nowrap;">${label}</div>
      </div>
    `,
    iconSize: [52, 64],
    iconAnchor: [26, 28],
    popupAnchor: [0, -20],
  })

const createUserLocationIcon = () =>
  L.divIcon({
    className: '',
    html: `
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;">
        <div style="width:20px;height:20px;border-radius:999px;background:#2563eb;border:3px solid #ffffff;box-shadow:0 0 0 6px rgba(37,99,235,.18),0 8px 18px rgba(37,99,235,.18)"></div>
        <div style="padding:2px 8px;border-radius:999px;background:#dbeafe;border:1px solid rgba(37,99,235,.18);font-size:11px;font-weight:700;color:#1d4ed8;white-space:nowrap;">Mi ubicación</div>
      </div>
    `,
    iconSize: [72, 56],
    iconAnchor: [36, 18],
    popupAnchor: [0, -12],
  })

const createCityIcon = (count: number, province: string, distanceLabel: string) =>
  L.divIcon({
    className: '',
    html: `
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;">
        <div style="min-width:36px;height:36px;padding:0 10px;border-radius:999px;background:${province === 'Huelva' ? '#0f766e' : '#7c3aed'};color:#ffffff;border:2px solid #ffffff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;box-shadow:0 8px 18px rgba(0,0,0,.24)">${count}</div>
        <div style="padding:2px 8px;border-radius:999px;background:#ffffff;border:1px solid rgba(15,23,42,.12);font-size:11px;font-weight:700;color:#111827;box-shadow:0 4px 12px rgba(15,23,42,.16);white-space:nowrap;">${distanceLabel}</div>
      </div>
    `,
    iconSize: [64, 62],
    iconAnchor: [32, 20],
    popupAnchor: [0, -10],
  })

const createCustomerIcon = (
  province: string,
  distanceLabel: string,
  approximate: boolean,
  selected: boolean
) =>
  L.divIcon({
    className: '',
    html: `
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;">
        <div style="width:${selected ? 18 : 16}px;height:${selected ? 18 : 16}px;border-radius:999px;background:${province === 'Huelva' ? '#14b8a6' : '#a855f7'};border:${approximate ? '2px dashed #94a3b8' : '2px solid #ffffff'};box-shadow:0 4px 12px rgba(0,0,0,.18);opacity:${approximate ? 0.8 : 1};outline:${selected ? '3px solid rgba(15,23,42,.18)' : 'none'}"></div>
        <div style="padding:2px 7px;border-radius:999px;background:${approximate ? '#f8fafc' : '#ffffff'};border:1px solid rgba(15,23,42,.12);font-size:10px;font-weight:700;color:${approximate ? '#64748b' : '#111827'};box-shadow:0 4px 10px rgba(15,23,42,.14);white-space:nowrap;">${distanceLabel}</div>
      </div>
    `,
    iconSize: [52, 44],
    iconAnchor: [26, 10],
    popupAnchor: [0, -4],
  })

function MapViewport({
  bounds,
  fitToken,
  fallbackCenter,
}: {
  bounds: LatLngBoundsExpression | null
  fitToken: number
  fallbackCenter: [number, number]
}) {
  const map = useMap()

  useEffect(() => {
    window.requestAnimationFrame(() => {
      map.invalidateSize()

      if (bounds) {
        map.fitBounds(bounds, { padding: [48, 48] })
        return
      }

      map.setView(fallbackCenter, 8)
    })
  }, [bounds, fallbackCenter, fitToken, map])

  return null
}

export default function VisitsMapModal({ customers, onClose }: VisitsMapModalProps) {
  const [coordsById, setCoordsById] = useState<CoordinateCache>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? (sanitizeCoordinateCache(JSON.parse(stored)) as CoordinateCache) : {}
    } catch {
      return {}
    }
  })
  const [activeOrigin, setActiveOrigin] = useState<DistanceOrigin>(JEREZ_ORIGIN)
  const [originMode, setOriginMode] = useState<OriginMode>('fallback')
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle')
  const [locationMessage, setLocationMessage] = useState<string | null>(null)
  const [expandedCityKey, setExpandedCityKey] = useState('')
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [fitToken, setFitToken] = useState(1)
  const [isResolvingCoords, setIsResolvingCoords] = useState(false)
  const [routeTimeByClientId, setRouteTimeByClientId] = useState<Record<string, RouteTimeEntry>>({})
  const mapRef = useRef<LeafletMap | null>(null)
  const customerMarkerRefs = useRef<Record<string, LeafletMarker | null>>({})
  const geocodeRunRef = useRef(false)
  const routeRunRef = useRef(false)
  const perfStatsRef = useRef({
    geocodeQueueSize: 0,
    geocodeBatchesCompleted: 0,
    markerRenderCount: 0,
    distanceCacheHits: 0,
    routeTimeCacheHits: 0,
    travelTimesRequested: 0,
    travelTimesResolved: 0,
    travelTimesFailed: 0,
  })

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  const supportedCustomers = useMemo(
    () => customers.filter(customer => ['Cádiz', 'Huelva'].includes(deriveProvince(customer))),
    [customers]
  )

  const distanceViewModel = useMemo(
    () =>
      refreshMapAndSidebarDistances({
        customers: supportedCustomers,
        coordsById,
        activeOrigin,
        routeTimeByClientId,
      }),
    [activeOrigin, coordsById, routeTimeByClientId, supportedCustomers]
  )

  const cityGroups = distanceViewModel.cities
  const customerEntries = distanceViewModel.clients
  const flaggedClients = useMemo(
    () => customerEntries.filter(client => client.geocodeStatus !== 'valid'),
    [customerEntries]
  )

  useEffect(() => {
    if (!expandedCityKey && cityGroups[0]) {
      setExpandedCityKey(`${cityGroups[0].province}|${cityGroups[0].city}`)
      return
    }

    if (expandedCityKey) {
      const stillExists = cityGroups.some(
        city => `${city.province}|${city.city}` === expandedCityKey
      )
      if (!stillExists) {
        setExpandedCityKey(cityGroups[0] ? `${cityGroups[0].province}|${cityGroups[0].city}` : '')
      }
    }
  }, [cityGroups, expandedCityKey])

  useEffect(() => {
    if (flaggedClients.length === 0) return

    console.table(
      flaggedClients.map(client => ({
        id: client.id,
        name: client.name,
        city: client.city,
        province: client.province,
        geocodeStatus: client.geocodeStatus,
        geocodeReason: client.geocodeReason,
        originalLat: client.originalLat,
        originalLng: client.originalLng,
        correctedLat: client.correctedLat,
        correctedLng: client.correctedLng,
        address: client.address,
      }))
    )
  }, [flaggedClients])

  const selectedClient = useMemo(
    () => customerEntries.find(client => client.id === selectedClientId) ?? null,
    [customerEntries, selectedClientId]
  )

  useEffect(() => {
    setRouteTimeByClientId({})
  }, [activeOrigin.coords.lat, activeOrigin.coords.lng])

  useEffect(() => {
    let cancelled = false

    const customersNeedingCoords = supportedCustomers.filter(customer => {
      const audit = getCoordinateAuditForClient(customer, coordsById[customer.id])
      if (audit.geocodeStatus === 'valid') return false
      if (audit.addressCompleteness === 'minimal') return false
      return true
    })

    if (customersNeedingCoords.length === 0 || geocodeRunRef.current) return

    const resolveInBatches = async () => {
      geocodeRunRef.current = true
      setIsResolvingCoords(true)
      perfStatsRef.current.geocodeQueueSize = customersNeedingCoords.length
      let cursor = 0
      let nextEntries: CoordinateCache = {}

      const flushBatch = () => {
        if (cancelled || Object.keys(nextEntries).length === 0) return
        const batch = nextEntries
        nextEntries = {}
        perfStatsRef.current.geocodeBatchesCompleted += 1
        setCoordsById(previous => {
          const merged = { ...previous, ...batch }
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
          return merged
        })
      }

      const worker = async () => {
        while (!cancelled && cursor < customersNeedingCoords.length) {
          const customer = customersNeedingCoords[cursor]
          cursor += 1
          if (!customer) continue

          try {
            const audit = await validateAndFixClientCoordinates(customer, {
              cachedAudit: coordsById[customer.id],
              geocodeFetcher: fetchGeocodeCandidates,
            })
            nextEntries[customer.id] = audit
          } catch {
            nextEntries[customer.id] = getCoordinateAuditForClient(customer, coordsById[customer.id])
          }

          if (Object.keys(nextEntries).length >= GEOCODE_BATCH_SIZE) {
            flushBatch()
          }
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(GEOCODE_CONCURRENCY, customersNeedingCoords.length) }, () =>
          worker()
        )
      )
      flushBatch()

      setIsResolvingCoords(false)
      geocodeRunRef.current = false
      const audits = Object.values(coordsById)
      console.log('[VISITS_GEOCODE] stats', {
        totalClients: supportedCustomers.length,
        geocodeQueueSize: perfStatsRef.current.geocodeQueueSize,
        geocodeBatchesCompleted: perfStatsRef.current.geocodeBatchesCompleted,
        validGeocodes: audits.filter(
          entry => 'geocodeStatus' in (entry as any) && (entry as ClientCoordinateAudit).geocodeStatus === 'valid'
        ).length,
        approximateGeocodes: audits.filter(
          entry => 'geocodeStatus' in (entry as any) && (entry as ClientCoordinateAudit).geocodeStatus === 'approximate'
        ).length,
        invalidGeocodes: audits.filter(
          entry => 'geocodeStatus' in (entry as any) && (entry as ClientCoordinateAudit).geocodeStatus === 'invalid'
        ).length,
        seaSuspectCount: audits.filter(
          entry => 'geocodeStatus' in (entry as any) && (entry as ClientCoordinateAudit).geocodeStatus === 'sea_suspect'
        ).length,
      })
    }

    resolveInBatches().catch(() => {
      geocodeRunRef.current = false
      setIsResolvingCoords(false)
    })

    return () => {
      cancelled = true
    }
  }, [coordsById, supportedCustomers])

  useEffect(() => {
    if (routeRunRef.current || !activeOrigin.coords) return

    const expandedCity = cityGroups.find(city => `${city.province}|${city.city}` === expandedCityKey) ?? null
    const prioritizedIds = new Set<string>()

    cityGroups.slice(0, PRIORITY_CITY_COUNT).forEach(city => {
      if (city.nearestClientIdFromUser) prioritizedIds.add(city.nearestClientIdFromUser)
    })

    expandedCity?.clients.forEach(client => {
      if (client.hasExactCoords) prioritizedIds.add(client.id)
    })

    if (selectedClient?.hasExactCoords) {
      prioritizedIds.add(selectedClient.id)
    }

    const queuedClients = customerEntries.filter(client => {
      if (!prioritizedIds.has(client.id) || !client.hasExactCoords || client.lat === null || client.lng === null) {
        return false
      }

      const cacheKey = `${activeOrigin.coords.lat.toFixed(5)},${activeOrigin.coords.lng.toFixed(5)}>${client.lat.toFixed(5)},${client.lng.toFixed(5)}`
      const existing = routeTimeByClientId[client.id]
      if (existing?.cacheKey === cacheKey && existing.status !== 'unavailable') {
        perfStatsRef.current.routeTimeCacheHits += 1
        return false
      }
      return true
    })

    if (queuedClients.length === 0) return

    routeRunRef.current = true

    setRouteTimeByClientId(previous => ({
      ...previous,
      ...Object.fromEntries(
        queuedClients.map(client => [
          client.id,
          {
            minutes: null,
            status: 'pending' as const,
            cacheKey: `${activeOrigin.coords.lat.toFixed(5)},${activeOrigin.coords.lng.toFixed(5)}>${client.lat?.toFixed(5)},${client.lng?.toFixed(5)}`,
          },
        ])
      ),
    }))

    let cancelled = false
    let cursor = 0
    let bufferedEntries: Record<string, RouteTimeEntry> = {}

    const flushRouteBatch = () => {
      if (cancelled || Object.keys(bufferedEntries).length === 0) return
      const batch = bufferedEntries
      bufferedEntries = {}
      setRouteTimeByClientId(previous => ({ ...previous, ...batch }))
    }

    const worker = async () => {
      while (!cancelled && cursor < queuedClients.length) {
        const client = queuedClients[cursor]
        cursor += 1
        if (!client) continue

        perfStatsRef.current.travelTimesRequested += 1
        try {
          const entry = await getRouteTimeFromUserToClient(activeOrigin.coords, client)
          bufferedEntries[client.id] = entry
          if (entry.status === 'ready') {
            perfStatsRef.current.travelTimesResolved += 1
          } else {
            perfStatsRef.current.travelTimesFailed += 1
          }
        } catch {
          bufferedEntries[client.id] = {
            minutes: null,
            status: 'unavailable',
            cacheKey: client.id,
          }
          perfStatsRef.current.travelTimesFailed += 1
        }

        if (Object.keys(bufferedEntries).length >= ROUTE_TIME_CONCURRENCY) {
          flushRouteBatch()
        }
      }
    }

    Promise.all(
      Array.from({ length: Math.min(ROUTE_TIME_CONCURRENCY, queuedClients.length) }, () => worker())
    )
      .then(() => {
        flushRouteBatch()
        routeRunRef.current = false
        console.log('[VISITS_ROUTE] stats', {
          travelTimesRequested: perfStatsRef.current.travelTimesRequested,
          travelTimesResolved: perfStatsRef.current.travelTimesResolved,
          travelTimesFailed: perfStatsRef.current.travelTimesFailed,
          routeTimeCacheHits: perfStatsRef.current.routeTimeCacheHits,
        })
      })
      .catch(() => {
        routeRunRef.current = false
      })

    return () => {
      cancelled = true
    }
  }, [activeOrigin, cityGroups, customerEntries, expandedCityKey, routeTimeByClientId, selectedClient])

  const mapBounds = useMemo<LatLngBoundsExpression | null>(() => {
    const points: [number, number][] = [
      [activeOrigin.coords.lat, activeOrigin.coords.lng],
      ...cityGroups
        .filter(city => city.coords)
        .map(city => [city.coords!.lat, city.coords!.lng] as [number, number]),
      ...customerEntries
        .filter(client => client.markerCoords)
        .map(client => [client.markerCoords!.lat, client.markerCoords!.lng] as [number, number]),
    ]

    return points.length > 0 ? points : null
  }, [activeOrigin, cityGroups, customerEntries])

  const focusClient = (client: DistanceAwareClient) => {
    setSelectedClientId(client.id)
    setExpandedCityKey(`${client.province}|${client.city}`)

    if (!client.markerCoords) return

    mapRef.current?.flyTo([client.markerCoords.lat, client.markerCoords.lng], 12, { duration: 0.8 })

    window.setTimeout(() => {
      customerMarkerRefs.current[client.id]?.openPopup()
    }, 250)
  }

  const handleFocusCity = (city: DistanceAwareCity) => {
    const cityKey = `${city.province}|${city.city}`
    setExpandedCityKey(previous => (previous === cityKey ? '' : cityKey))

    if (city.coords) {
      mapRef.current?.flyTo([city.coords.lat, city.coords.lng], 10, { duration: 0.8 })
    }
  }

  const handleLocateMe = async () => {
    if (locationStatus === 'locating') return

    setLocationStatus('locating')
    setLocationMessage(null)

    try {
      const coords = await getUserLocation()
      setActiveOrigin({ name: 'Mi ubicación', coords })
      setOriginMode('user')
      setLocationStatus('granted')
      setLocationMessage('Distancias actualizadas desde tu ubicación.')
      setFitToken(previous => previous + 1)
    } catch (error: any) {
      const code = error?.code
      const denied = code === 1
      setActiveOrigin(JEREZ_ORIGIN)
      setOriginMode('fallback')
      setLocationStatus(denied ? 'denied' : 'unavailable')
      setLocationMessage(
        denied
          ? `Permiso denegado. Mostrando distancias desde ${JEREZ_ORIGIN.name}.`
          : `No se pudo obtener tu ubicación. Mostrando distancias desde ${JEREZ_ORIGIN.name}.`
      )
      setFitToken(previous => previous + 1)
    }
  }

  const originBadgeLabel = originMode === 'user' ? 'Mi ubicación' : activeOrigin.name
  const renderAllMarkers = (clients: DistanceAwareClient[]) => clients.filter(client => Boolean(client.markerCoords))
  const renderSidebarCities = (cities: DistanceAwareCity[]) => cities
  const renderExpandedCityClients = (city: DistanceAwareCity) => city.clients

  useEffect(() => {
    perfStatsRef.current.markerRenderCount = renderAllMarkers(customerEntries).length
    console.log('[VISITS_PERF] stats', {
      geocodeQueueSize: perfStatsRef.current.geocodeQueueSize,
      geocodeBatchesCompleted: perfStatsRef.current.geocodeBatchesCompleted,
      markerRenderCount: perfStatsRef.current.markerRenderCount,
      distanceCacheHits: perfStatsRef.current.distanceCacheHits,
      routeTimeCacheHits: perfStatsRef.current.routeTimeCacheHits,
    })
  }, [customerEntries])

  return (
    <div className="fixed inset-0 z-[1000] bg-black/55 backdrop-blur-sm">
      <div className="flex h-full w-full flex-col bg-slate-100">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-6">
          <div>
            <div className="flex items-center gap-2 text-slate-900">
              <MapPin className="h-5 w-5 text-violet-600" />
              <h2 className="text-lg font-semibold">Mapa de Visitas</h2>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {originMode === 'user'
                ? 'Cádiz y Huelva ordenados desde tu ubicación actual'
                : `Cádiz y Huelva desde ${JEREZ_ORIGIN.name}`}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-violet-100 px-2.5 py-1 font-medium text-violet-700">
                {customerEntries.length} clientes
              </span>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-700">
                {cityGroups.length} ciudades
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
                Base: {originBadgeLabel}
              </span>
              {flaggedClients.length > 0 && (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-700">
                  {flaggedClients.length} ubicaciones requieren revisión
                </span>
              )}
              {isResolvingCoords && (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-700">
                  Validando coordenadas...
                </span>
              )}
              {locationMessage && (
                <span className={`rounded-full px-2.5 py-1 font-medium ${
                  locationStatus === 'granted'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {locationMessage}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleLocateMe}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={locationStatus === 'locating'}
            >
              <Crosshair className="h-4 w-4" />
              <span>{locationStatus === 'locating' ? 'Ubicando...' : 'Mi ubicación'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
              <span>Cerrar</span>
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[380px_minmax(0,1fr)]">
          <aside className="order-2 flex min-h-0 flex-col border-t border-slate-200 bg-white lg:order-1 lg:border-r lg:border-t-0">
            <div className="border-b border-slate-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">Ciudades por distancia</h3>
              <p className="mt-1 text-xs text-slate-500">
                Expande una ciudad para ver clientes, distancias, navegar o llamar.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {renderSidebarCities(cityGroups).map(city => {
                const cityKey = `${city.province}|${city.city}`
                const isOpen = expandedCityKey === cityKey

                return (
                  <div
                    key={cityKey}
                    className={`border-b border-slate-100 ${isOpen ? 'bg-slate-50' : 'bg-white'}`}
                  >
                    <button
                      type="button"
                      onClick={() => handleFocusCity(city)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">{city.city}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {city.clientCount} cliente{city.clientCount === 1 ? '' : 's'} · {city.province}
                        </div>
                      </div>
                      <div className="rounded-full bg-slate-900/5 px-3 py-1 text-xs font-semibold text-slate-700">
                        {formatDistanceAndTime(
                          city.nearestDistanceFromUserKm,
                          city.nearestTravelTimeMinutes,
                          city.nearestClientIdFromUser
                            ? routeTimeByClientId[city.nearestClientIdFromUser]?.status ?? 'unavailable'
                            : 'unavailable'
                        )}
                      </div>
                    </button>

                    {isOpen && (
                      <div className="space-y-3 px-4 pb-4">
                        {renderExpandedCityClients(city).map(client => {
                          const isSelected = selectedClientId === client.id
                          return (
                            <button
                              key={client.id}
                              type="button"
                              onClick={() => focusClient(client)}
                              className={`block w-full rounded-xl border p-3 text-left shadow-sm transition ${
                                isSelected
                                  ? 'border-violet-300 bg-violet-50'
                                  : 'border-slate-200 bg-white hover:border-slate-300'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-slate-900">{client.name}</div>
                                  <div className="mt-2 text-xs leading-5 text-slate-600">{client.address}</div>
                                  <div className="mt-2 space-y-1 text-[11px] text-slate-500">
                                    <div>
                                      Distancia desde mi ubicación:{' '}
                                      {formatDistanceAndTime(
                                        client.distanceFromUserKm,
                                        client.travelTimeMinutes,
                                        client.travelTimeStatus
                                      )}
                                    </div>
                                    <div>Cliente más cercano {formatDistanceKm(client.nearestNeighborDistanceInCity)}</div>
                                    {client.geocodeStatus === 'approximate' && (
                                      <div className="text-amber-600">
                                        Ubicación aproximada. Dirección pendiente de validación.
                                      </div>
                                    )}
                                    {(client.geocodeStatus === 'invalid' ||
                                      client.geocodeStatus === 'sea_suspect') && (
                                      <div className="text-rose-600">Revisar: {client.geocodeReason}</div>
                                    )}
                                  </div>
                                </div>
                                <div className="shrink-0 space-y-1 text-right">
                                  <div className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                                    {formatDistanceAndTime(
                                      client.distanceFromUserKm,
                                      client.travelTimeMinutes,
                                      client.travelTimeStatus
                                    )}
                                  </div>
                                  {client.requiresManualReview && (
                                    <div className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-700">
                                      <AlertTriangle className="h-3 w-3" />
                                      <span>Revisar</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <a
                                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.address)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={event => event.stopPropagation()}
                                  className="inline-flex items-center gap-1 rounded-lg bg-violet-50 px-2.5 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100"
                                >
                                  <Navigation className="h-3.5 w-3.5" />
                                  <span>Navegar</span>
                                </a>
                                {client.phone && (
                                  <a
                                    href={`tel:${client.phone}`}
                                    onClick={event => event.stopPropagation()}
                                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                                  >
                                    <Phone className="h-3.5 w-3.5" />
                                    <span>{client.phone}</span>
                                  </a>
                                )}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </aside>

          <div className="order-1 min-h-[48vh] lg:order-2 lg:min-h-0">
            <MapContainer
              center={[activeOrigin.coords.lat, activeOrigin.coords.lng]}
              zoom={8}
              className="h-full w-full"
              ref={instance => {
                mapRef.current = instance
              }}
            >
              <TileLayer
                attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <MapViewport
                bounds={mapBounds}
                fitToken={fitToken}
                fallbackCenter={[activeOrigin.coords.lat, activeOrigin.coords.lng]}
              />

              {originMode === 'fallback' ? (
                <Marker
                  position={[activeOrigin.coords.lat, activeOrigin.coords.lng]}
                  icon={createOriginIcon(activeOrigin.name)}
                >
                  <Popup>
                    <div className="space-y-1">
                      <div className="font-semibold">Base actual</div>
                      <div>{activeOrigin.name}</div>
                    </div>
                  </Popup>
                </Marker>
              ) : (
                <Marker
                  position={[activeOrigin.coords.lat, activeOrigin.coords.lng]}
                  icon={createUserLocationIcon()}
                >
                  <Popup>
                    <div className="space-y-1">
                      <div className="font-semibold">Mi ubicación</div>
                      <div>Las distancias actuales usan este punto como base.</div>
                    </div>
                  </Popup>
                </Marker>
              )}

              {renderSidebarCities(cityGroups).map(city => {
                if (!city.coords) return null

                return (
                  <React.Fragment key={`${city.province}|${city.city}`}>
                    <Polyline
                      positions={[
                        [activeOrigin.coords.lat, activeOrigin.coords.lng],
                        [city.coords.lat, city.coords.lng],
                      ]}
                      pathOptions={{
                        color: city.province === 'Huelva' ? '#14b8a6' : '#a855f7',
                        weight: 2,
                        opacity: 0.35,
                        dashArray: '6 8',
                      }}
                    />
                    <Marker
                      position={[city.coords.lat, city.coords.lng]}
                      icon={createCityIcon(
                        city.clientCount,
                        city.province,
                        formatMarkerBadge(city.nearestDistanceFromUser)
                      )}
                      eventHandlers={{
                        click: () => handleFocusCity(city),
                      }}
                    >
                      <Popup minWidth={260}>
                        <div className="space-y-2">
                          <div className="font-semibold text-slate-900">{city.city}</div>
                          <div className="text-xs text-slate-500">
                            Distancia base:{' '}
                            {formatDistanceAndTime(
                              city.nearestDistanceFromUserKm,
                              city.nearestTravelTimeMinutes,
                              city.nearestClientIdFromUser
                                ? routeTimeByClientId[city.nearestClientIdFromUser]?.status ?? 'unavailable'
                                : 'unavailable'
                            )}
                          </div>
                          <div className="space-y-2">
                            {renderExpandedCityClients(city).map(client => (
                              <div
                                key={client.id}
                                className="border-t border-slate-100 pt-2 first:border-t-0 first:pt-0"
                              >
                                <button
                                  type="button"
                                  onClick={() => focusClient(client)}
                                  className="w-full text-left"
                                >
                                  <div className="text-sm font-medium text-slate-900">{client.name}</div>
                                  <div className="mt-1 text-xs text-slate-500">{client.address}</div>
                                  <div className="mt-1 text-[11px] text-slate-500">
                                    Distancia desde mi ubicación:{' '}
                                    {formatDistanceAndTime(
                                      client.distanceFromUserKm,
                                      client.travelTimeMinutes,
                                      client.travelTimeStatus
                                    )}
                                  </div>
                                  {client.requiresManualReview && (
                                    <div className="mt-1 text-[11px] text-amber-600">
                                      {client.geocodeReason}
                                    </div>
                                  )}
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  </React.Fragment>
                )
              })}

              {renderAllMarkers(customerEntries)
                .filter(client => client.markerCoords)
                .map(client => (
                  <Marker
                    key={client.id}
                    position={[client.markerCoords!.lat, client.markerCoords!.lng]}
                    icon={createCustomerIcon(
                      client.province,
                      formatMarkerBadge(client.distanceFromUserKm),
                      client.usesApproximateMarker,
                      client.id === selectedClientId
                    )}
                    ref={marker => {
                      customerMarkerRefs.current[client.id] = marker
                    }}
                    eventHandlers={{
                      click: () => {
                        setSelectedClientId(client.id)
                        setExpandedCityKey(`${client.province}|${client.city}`)
                      },
                    }}
                  >
                    <Popup minWidth={260}>
                      <div className="space-y-2">
                        <div className="font-semibold text-slate-900">{client.name}</div>
                        <div className="text-xs text-slate-500">{client.address}</div>
                        <div className="space-y-1 text-[11px] text-slate-600">
                          <div>
                            Distancia desde mi ubicación:{' '}
                            {formatDistanceAndTime(
                              client.distanceFromUserKm,
                              client.travelTimeMinutes,
                              client.travelTimeStatus
                            )}
                          </div>
                          <div>Cliente más cercano {formatDistanceKm(client.nearestNeighborDistanceInCity)}</div>
                          {client.usesApproximateMarker && (
                            <>
                              <div className="text-amber-600">Ubicación aproximada</div>
                              <div className="text-amber-600">Dirección pendiente de validación</div>
                            </>
                          )}
                          {client.requiresManualReview && !client.usesApproximateMarker && (
                            <div className="text-amber-600">{client.geocodeReason}</div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.address)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-violet-700"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            <span>Navegar</span>
                          </a>
                          {client.phone && (
                            <a
                              href={`tel:${client.phone}`}
                              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"
                            >
                              <Phone className="h-3.5 w-3.5" />
                              <span>{client.phone}</span>
                            </a>
                          )}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                ))}
            </MapContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
