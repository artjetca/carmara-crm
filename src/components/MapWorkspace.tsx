import React, { useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, Eye, EyeOff, Users, X } from 'lucide-react'

type MapWorkspaceHeaderProps = {
  title: string
  onOpenDrawer?: () => void
  drawerLabel?: string
  focusMode: boolean
  onToggleFocusMode: () => void
}

export function MapWorkspaceHeader({ title, onOpenDrawer, drawerLabel = 'Abrir panel', focusMode, onToggleFocusMode }: MapWorkspaceHeaderProps) {
  if (focusMode) return null

  return (
    <div className="absolute left-4 top-4 z-[650] hidden h-12 items-center gap-2 rounded-xl border border-white/70 bg-white/95 p-1.5 shadow-lg backdrop-blur-md lg:flex">
      <span className="px-2 text-sm font-semibold text-gray-900">{title}</span>
      {onOpenDrawer && (
        <button type="button" onClick={onOpenDrawer} aria-label={drawerLabel} title={drawerLabel} className="min-h-9 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
          {drawerLabel}
        </button>
      )}
      <button type="button" onClick={onToggleFocusMode} aria-label="Modo mapa" title="Modo mapa" className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
        <Eye className="h-4 w-4" />
      </button>
    </div>
  )
}

type MapDrawerProps = {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  widthClassName?: string
  side?: 'left' | 'right'
  collapsed?: boolean
  onToggleCollapsed?: () => void
  collapsedCount?: number
}

export function MapDrawer({ open, onClose, title, children, widthClassName = 'w-[380px]', side = 'left', collapsed = false, onToggleCollapsed, collapsedCount }: MapDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [onClose, open])

  return (
    <div className={`absolute bottom-4 top-20 z-[700] hidden max-w-[calc(100%-96px)] md:block ${side === 'right' ? 'right-4' : 'left-4'} ${collapsed ? 'w-16' : widthClassName} transition-[width,transform,opacity] duration-200 ${open ? 'translate-x-0 opacity-100' : `pointer-events-none opacity-0 ${side === 'right' ? 'translate-x-4' : '-translate-x-4'}`} `}>
      <div ref={panelRef} className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/95 shadow-2xl backdrop-blur-md">
        {collapsed ? (
          <button type="button" onClick={onToggleCollapsed} aria-label={`Expandir ${title}`} title={`Expandir ${title}`} className="flex h-full flex-col items-center justify-center gap-3 text-blue-700 transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <Users className="h-5 w-5" />
            {collapsedCount !== undefined && <span className="text-xs font-semibold">{collapsedCount}</span>}
            <ChevronLeft className="h-4 w-4" />
          </button>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
              <div className="flex items-center gap-1">
                {onToggleCollapsed && <button type="button" onClick={onToggleCollapsed} aria-label={`Minimizar ${title}`} title="Minimizar" className="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"><ChevronRight className="h-4 w-4" /></button>}
                <button type="button" onClick={onClose} aria-label="Cerrar panel" title="Cerrar" className="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"><X className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          </>
        )}
      </div>
    </div>
  )
}

type MapFocusButtonProps = {
  active: boolean
  onClick: () => void
}

export function MapFocusButton({ active, onClick }: MapFocusButtonProps) {
  useEffect(() => {
    if (!active) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClick()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [active, onClick])

  if (!active) return null

  return (
    <button type="button" onClick={onClick} aria-label={active ? 'Salir del modo mapa' : 'Modo mapa'} title={active ? 'Salir del modo mapa' : 'Modo mapa'} className="absolute left-4 top-4 z-[650] hidden h-11 items-center gap-2 rounded-xl border border-white/70 bg-white/95 px-3 text-xs font-semibold text-gray-700 shadow-lg backdrop-blur-md transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 md:flex">
      {active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      {active ? 'Salir del modo mapa' : 'Modo mapa'}
    </button>
  )
}
