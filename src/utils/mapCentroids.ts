/**
 * Shared map centroids for all map pages
 * Single source of truth for province and default coordinates
 */

export type ProvinceKey = 'Cádiz' | 'Huelva' | 'Ceuta'

/**
 * Province-level centroids for fallback positioning
 * These are used when no specific city/customer coordinates are available
 * 
 * IMPORTANT: All coordinates must be on land, not in water/bay/harbor
 */
export const PROVINCE_CENTERS: Record<ProvinceKey, [number, number]> = {
  'Cádiz': [36.5297, -6.2920],   // Cádiz city center - on land, not bay
  'Huelva': [37.26, -6.95],       // Huelva city center
  'Ceuta': [35.89, -5.32],        // Ceuta city center
}

/**
 * Default map center (Cádiz province center)
 * Used as fallback when no province is selected
 */
export const DEFAULT_MAP_CENTER: [number, number] = PROVINCE_CENTERS['Cádiz']

/**
 * Get province center coordinates
 * Returns default center if province not found
 */
export function getProvinceCenter(province: string): [number, number] {
  return PROVINCE_CENTERS[province as ProvinceKey] || DEFAULT_MAP_CENTER
}
