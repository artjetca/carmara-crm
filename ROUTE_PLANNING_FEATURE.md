# Ruta Planificada - Feature Documentation

## Overview
Added a planned route (Ruta Planificada) feature to the Visits page with PDF export capability.

## What Was Added

### 1. New UI Components in Visits Page (`src/pages/Visits.tsx`)

#### PDF Export Button
- Green "Descargar PDF" button that appears when there are visits for the selected date
- Located in the header next to the "Programar Visita" button
- Uses Printer icon from lucide-react

#### Route Planning View
- Modal overlay that displays all visits for the selected date
- Shows visits sorted by time in a clean, professional layout
- Each stop includes:
  - Stop number (numbered 1, 2, 3, etc.)
  - Customer name and company
  - Scheduled time
  - Address and city
  - Phone number
  - Purpose (if provided)
  - Notes (if provided)
- Header shows:
  - "Ruta Planificada" title
  - Selected date
  - Total number of stops (paradas)
- Footer shows generation timestamp

### 2. Print Styles (`src/index.css`)

Added comprehensive `@media print` CSS rules to ensure:
- Only the route plan is visible when printing
- All screen elements are hidden during print
- Proper A4 page sizing (210mm x 297mm)
- 15mm margins on all sides
- Page break prevention inside items
- Color preservation for print
- Proper visibility control

### 3. Key Features

#### Sorting
- Visits are automatically sorted by scheduled time
- Ensures logical route order from earliest to latest visit

#### Auto-close
- Print dialog opens automatically
- Modal closes automatically after print/cancel

#### Responsive Design
- Clean layout that fits well on A4 paper
- Prevents page breaks within individual visit items
- Professional appearance suitable for field use

## How to Use

1. Navigate to "Programación de Visitas" (Visits page)
2. Select a date using the date picker or navigation arrows
3. When visits are displayed, click the green "Descargar PDF" button
4. The print dialog will open with the formatted route plan
5. Choose "Save as PDF" or print directly
6. All visits for the selected date will appear on the printout

## Technical Implementation

### State Management
```typescript
const [showRoutePlan, setShowRoutePlan] = useState(false)
```

### Print Handler
```typescript
const handlePrintRoute = () => {
  setShowRoutePlan(true)
  setTimeout(() => {
    window.print()
    setTimeout(() => {
      setShowRoutePlan(false)
    }, 500)
  }, 100)
}
```

### Visit Sorting
```typescript
const sortedVisits = [...filteredVisits].sort((a, b) => {
  return a.scheduled_time.localeCompare(b.scheduled_time)
})
```

## Bug Fix
This addresses the original issue where:
- Problem: Only 5 out of 9 visits were showing in the PDF
- Solution: All visits are now displayed in a single view with proper print styles
- Enhancement: Visits are sorted by time for logical route planning
- Improvement: Professional layout that fits properly on one or more pages as needed

## Files Modified
1. `src/pages/Visits.tsx` - Added route planning UI and print functionality
2. `src/index.css` - Added print-specific CSS rules

## Dependencies
No new dependencies were added. Uses existing:
- `lucide-react` for Printer icon
- Native browser `window.print()` API
- CSS `@media print` queries
