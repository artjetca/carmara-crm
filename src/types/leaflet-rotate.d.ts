import type { Handler } from 'leaflet'

declare module 'leaflet' {
  interface MapOptions {
    rotate?: boolean
    rotateControl?: boolean
    bearing?: number
  }

  interface Map {
    setBearing(angle: number): this
    getBearing(): number
    compassBearing?: Handler
  }
}

declare module 'leaflet-rotate'
