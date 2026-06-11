import React, { useEffect } from 'react'
import { useStore } from '../store/useStore'
import { useAuth } from '../hooks/useAuth'
import { translations } from '../lib/translations'
import {
  LayoutDashboard,
  Users,
  Calendar,
  Map,
  MessageSquare,
  Upload,
  Database,
  CheckSquare,
  Settings,
  LogOut,
  MoreHorizontal,
  X,
  UserSearch,
} from 'lucide-react'

interface LayoutProps {
  children: React.ReactNode
}

const navigationItems = [
  {
    id: 'dashboard',
    label: 'dashboard.title',
    icon: LayoutDashboard,
    path: '/dashboard'
  },
  {
    id: 'customers',
    label: 'customers.title',
    icon: Users,
    path: '/customers'
  },
  {
    id: 'visits',
    label: 'visits.title',
    icon: Calendar,
    path: '/visits'
  },
  {
    id: 'map',
    label: 'maps.title',
    icon: Map,
    path: '/map'
  },
  {
    id: 'prospectMap',
    label: 'prospectMap.title',
    icon: UserSearch,
    path: '/prospect-map'
  },
  {
    id: 'communications',
    label: 'communications.title',
    icon: MessageSquare,
    path: '/communications'
  },
  {
    id: 'dataImport',
    label: 'dataImport.title',
    icon: Upload,
    path: '/data-import'
  },
  {
    id: 'settings',
    label: 'settings.title',
    icon: Settings,
    path: '/settings'
  }
]

// Pestañas inferiores para móvil (las demás páginas van en el cajón "Más")
const mobileTabs = [
  { id: 'dashboard', label: 'Inicio', icon: LayoutDashboard },
  { id: 'customers', label: 'Clientes', icon: Users },
  { id: 'visits', label: 'Visitas', icon: Calendar },
  { id: 'map', label: 'Mapa', icon: Map },
]

export default function Layout({ children }: LayoutProps) {
  const { currentPage, sidebarOpen, setCurrentPage, setSidebarOpen } = useStore()
  const { user, signOut } = useAuth()
  const t = translations

  // En móvil el cajón no debe quedar abierto al cargar (lo sustituye la barra inferior)
  useEffect(() => {
    if (window.innerWidth < 768) {
      setSidebarOpen(false)
    }
  }, [setSidebarOpen])

  const handleNavigation = (pageId: string) => {
    setCurrentPage(pageId)
    // En móvil, cerrar sidebar después de navegar
    if (window.innerWidth < 768) {
      setSidebarOpen(false)
    }
  }

  const handleSignOut = async () => {
    await signOut()
  }

  const getNestedTranslation = (key: string) => {
    const keys = key.split('.')
    let value: any = t
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k]
      } else {
        return key // 如果找不到翻译，返回原始键
      }
    }
    return value || key
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-[1200] w-64 bg-blue-900 transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        md:relative md:translate-x-0 md:z-auto
      `}>
        <div className="flex flex-col h-full">
          {/* Header del sidebar */}
          <div className="flex items-center justify-between p-4 border-b border-blue-800">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-900" />
              </div>
              <div>
                <h1 className="text-white font-bold text-lg">Casmara CRM</h1>
                <p className="text-blue-200 text-xs">{t.nav.superSalesman}</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden text-white hover:text-blue-200"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Información del usuario */}
          <div className="p-4 border-b border-blue-800">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-700 rounded-full flex items-center justify-center">
                <span className="text-white font-medium">
                  {user?.user_metadata?.full_name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium truncate">
                  {user?.user_metadata?.full_name || t.common.user}
                </p>
                <p className="text-blue-200 text-sm truncate">
                  {user?.email}
                </p>
              </div>
            </div>
          </div>

          {/* Navegación */}
          <nav className="flex-1 p-4 space-y-2">
            {navigationItems.map((item) => {
              const Icon = item.icon
              const isActive = currentPage === item.id
              
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigation(item.id)}
                  className={`
                    w-full flex items-center space-x-3 px-3 py-3 md:py-2 rounded-lg text-left transition-colors
                    ${isActive
                      ? 'bg-blue-800 text-white'
                      : 'text-blue-100 hover:bg-blue-800 hover:text-white'
                    }
                  `}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{getNestedTranslation(item.label)}</span>
                </button>
              )
            })}
          </nav>

          {/* Botón de cerrar sesión */}
          <div
            className="p-4 border-t border-blue-800"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            <button
              onClick={handleSignOut}
              className="w-full flex items-center space-x-3 px-3 py-2 text-blue-100 hover:bg-blue-800 hover:text-white rounded-lg transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium">{t.nav.logout}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Overlay para móvil */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-[1150] md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="flex items-center justify-between px-4 py-2 md:py-3">
            <h2 className="text-lg md:text-xl font-semibold text-gray-900">
              {getNestedTranslation(navigationItems.find(item => item.id === currentPage)?.label || 'dashboard.title')}
            </h2>
            <span className="hidden md:block text-sm text-gray-600">
              {new Date().toLocaleDateString('es-ES', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </span>
          </div>
        </header>

        {/* Contenido */}
        <main className="flex-1 overflow-auto p-3 pb-24 md:p-6 md:pb-6">
          {children}
        </main>
      </div>

      {/* Barra de pestañas inferior (solo móvil) — cápsula flotante estilo app */}
      <nav
        className="fixed bottom-2 inset-x-3 z-[1100] rounded-full border border-gray-200/70 bg-white/90 shadow-xl backdrop-blur-md md:hidden"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="grid grid-cols-5">
          {mobileTabs.map((tab) => {
            const Icon = tab.icon
            const isActive = currentPage === tab.id && !sidebarOpen
            return (
              <button
                key={tab.id}
                onClick={() => handleNavigation(tab.id)}
                className={`flex flex-col items-center justify-center gap-0.5 min-h-[56px] ${
                  isActive ? 'text-blue-700' : 'text-gray-500'
                }`}
              >
                <Icon className="w-6 h-6" />
                <span className="text-[11px] font-medium leading-none">{tab.label}</span>
              </button>
            )
          })}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`flex flex-col items-center justify-center gap-0.5 min-h-[56px] ${
              sidebarOpen ? 'text-blue-700' : 'text-gray-500'
            }`}
          >
            <MoreHorizontal className="w-6 h-6" />
            <span className="text-[11px] font-medium leading-none">Más</span>
          </button>
        </div>
      </nav>
    </div>
  )
}