import React, { useEffect, useRef, useState } from 'react'
import { BarChart3, Layers, Wrench, X } from 'lucide-react'

export type MapFloatingToolbarAction = {
  id: string
  label: string
  icon: React.ReactNode
  onClick: () => void
  ariaLabel?: string
  tooltip?: string
  disabled?: boolean
  active?: boolean
}

type MapFloatingToolbarProps = {
  actions: MapFloatingToolbarAction[]
  legend?: React.ReactNode
  statistics?: React.ReactNode
  className?: string
  offsetRightClassName?: string
}

export function MapFloatingToolbar({ actions, legend, statistics, className = '', offsetRightClassName = 'right-4' }: MapFloatingToolbarProps) {
  const [expanded, setExpanded] = useState(false)
  const [activePanel, setActivePanel] = useState<'legend' | 'statistics' | null>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const close = (restoreFocus = false) => {
    setExpanded(false)
    setActivePanel(null)
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  useEffect(() => {
    if (!expanded) return

    const firstAction = toolbarRef.current?.querySelector<HTMLButtonElement>('[data-map-toolbar-action]')
    firstAction?.focus()

    const handlePointerDown = (event: PointerEvent) => {
      if (!toolbarRef.current?.contains(event.target as Node)) close()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close(true)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [expanded])

  const toggle = () => {
    if (expanded) {
      close()
      return
    }
    setExpanded(true)
  }

  return (
    <div ref={toolbarRef} className={`absolute bottom-9 ${offsetRightClassName} z-[650] hidden flex-col items-end gap-2 md:flex ${className}`}>
      <div
        aria-hidden={!expanded}
        className={`flex flex-col items-end gap-2 transition duration-200 ease-out ${expanded ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0'}`}
      >
          {activePanel && (
            <div className="absolute bottom-0 right-14 w-64 rounded-xl border border-gray-200 bg-white/95 p-3 text-xs shadow-xl backdrop-blur-md">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="font-semibold text-gray-800">{activePanel === 'legend' ? 'Leyenda' : 'Estadísticas'}</span>
                <button
                  type="button"
                  onClick={() => setActivePanel(null)}
                  aria-label="Cerrar panel"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {activePanel === 'legend' ? legend : statistics}
            </div>
          )}
          {legend && (
            <button
              type="button"
              onClick={() => setActivePanel(panel => panel === 'legend' ? null : 'legend')}
              aria-label="Mostrar leyenda del mapa"
              aria-pressed={activePanel === 'legend'}
              tabIndex={expanded ? 0 : -1}
              title="Leyenda"
              className={`flex h-11 min-w-11 items-center justify-center rounded-full border shadow-lg transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${activePanel === 'legend' ? 'border-blue-200 bg-blue-600 text-white' : 'border-white/70 bg-white/95 text-gray-700 hover:bg-white'}`}
            >
              <Layers className="h-5 w-5" />
            </button>
          )}
          {statistics && (
            <button
              type="button"
              onClick={() => setActivePanel(panel => panel === 'statistics' ? null : 'statistics')}
              aria-label="Mostrar estadísticas del mapa"
              aria-pressed={activePanel === 'statistics'}
              tabIndex={expanded ? 0 : -1}
              title="Estadísticas"
              className={`flex h-11 min-w-11 items-center justify-center rounded-full border shadow-lg transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${activePanel === 'statistics' ? 'border-blue-200 bg-blue-600 text-white' : 'border-white/70 bg-white/95 text-gray-700 hover:bg-white'}`}
            >
              <BarChart3 className="h-5 w-5" />
            </button>
          )}
          {actions.map(action => (
            <button
              key={action.id}
              type="button"
              data-map-toolbar-action
              onClick={() => {
                action.onClick()
                close()
              }}
              disabled={action.disabled}
              aria-label={action.ariaLabel ?? action.label}
              aria-pressed={action.active}
              tabIndex={expanded ? 0 : -1}
              title={action.tooltip ?? action.label}
              className={`flex h-11 min-w-11 items-center justify-center rounded-full border shadow-lg transition focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 ${action.active ? 'border-blue-200 bg-blue-600 text-white' : 'border-white/70 bg-white/95 text-gray-700 hover:bg-white'}`}
            >
              {action.icon}
            </button>
          ))}
      </div>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-label="Abrir herramientas del mapa"
        aria-expanded={expanded}
        title="Herramientas del mapa"
        className={`flex h-11 w-11 items-center justify-center rounded-full border shadow-lg transition duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${expanded ? 'border-blue-200 bg-blue-600 text-white' : 'border-white/70 bg-white/95 text-gray-700 hover:bg-white'}`}
      >
        <Wrench className="h-5 w-5" />
      </button>
    </div>
  )
}
