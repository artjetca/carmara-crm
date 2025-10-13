import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Customer, Visit, Profile } from '../lib/supabase'

interface AppState {
  // Estado de la aplicación
  currentPage: string
  sidebarOpen: boolean
  
  // Datos
  customers: Customer[]
  visits: Visit[]
  profile: Profile | null
  
  // Estados de carga
  loadingCustomers: boolean
  loadingVisits: boolean
  loadingProfile: boolean

  // Destacar registros recién importados
  importHighlightSince: string | null
  setImportHighlightSince: (isoString: string) => void
  clearImportHighlight: () => void
  
  // Acciones
  setCurrentPage: (page: string) => void
  setSidebarOpen: (open: boolean) => void
  
  // Acciones de datos
  setCustomers: (customers: Customer[]) => void
  addCustomer: (customer: Customer) => void
  updateCustomer: (id: string, customer: Partial<Customer>) => void
  removeCustomer: (id: string) => void
  
  setVisits: (visits: Visit[]) => void
  addVisit: (visit: Visit) => void
  updateVisit: (id: string, visit: Partial<Visit>) => void
  removeVisit: (id: string) => void
  
  setProfile: (profile: Profile | null) => void
  
  // Acciones de carga
  setLoadingCustomers: (loading: boolean) => void
  setLoadingVisits: (loading: boolean) => void
  setLoadingProfile: (loading: boolean) => void
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Estado inicial
      currentPage: 'dashboard',
      sidebarOpen: true,
      
      customers: [],
      visits: [],
      profile: null,
      
      loadingCustomers: false,
      loadingVisits: false,
      loadingProfile: false,

      // Destacar registros recién importados
      importHighlightSince: null,
      setImportHighlightSince: (isoString) => set({ importHighlightSince: isoString }),
      clearImportHighlight: () => set({ importHighlightSince: null }),
      
      // Acciones
      setCurrentPage: (page) => set({ currentPage: page }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      
      // Acciones de datos
      setCustomers: (customers) => set({ customers }),
      addCustomer: (customer) => set((state) => ({ 
        customers: [...state.customers, customer] 
      })),
      updateCustomer: (id, customerUpdate) => set((state) => ({
        customers: state.customers.map(customer => 
          customer.id === id ? { ...customer, ...customerUpdate } : customer
        )
      })),
      removeCustomer: (id) => set((state) => ({
        customers: state.customers.filter(customer => customer.id !== id)
      })),
      
      setVisits: (visits) => set({ visits }),
      addVisit: (visit) => set((state) => ({ 
        visits: [...state.visits, visit] 
      })),
      updateVisit: (id, visitUpdate) => set((state) => ({
        visits: state.visits.map(visit => 
          visit.id === id ? { ...visit, ...visitUpdate } : visit
        )
      })),
      removeVisit: (id) => set((state) => ({
        visits: state.visits.filter(visit => visit.id !== id)
      })),
      
      setProfile: (profile) => set({ profile }),
      
      // Acciones de carga
      setLoadingCustomers: (loading) => set({ loadingCustomers: loading }),
      setLoadingVisits: (loading) => set({ loadingVisits: loading }),
      setLoadingProfile: (loading) => set({ loadingProfile: loading })
    }),
    {
      name: 'casmara-app-state',
      partialize: (state) => ({ 
        currentPage: state.currentPage,
        sidebarOpen: state.sidebarOpen 
      }),
    }
  )
)