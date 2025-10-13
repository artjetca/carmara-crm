import React from 'react'
import { useAuth } from './hooks/useAuth'
import AuthContainer from './components/AuthContainer'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Customers from './pages/Customers'
import Visits from './pages/Visits'
import Maps from './pages/Maps'
import Communications from './pages/Communications'
import DataImport from './pages/DataImport'
import BulkCustomerImport from './pages/BulkCustomerImport'
import CustomerVerification from './pages/CustomerVerification'
import Settings from './pages/Settings'
import { useStore } from './store/useStore'

// Componente para renderizar la página actual
function CurrentPage() {
  const { currentPage } = useStore()
  
  switch (currentPage) {
    case 'dashboard':
      return <Dashboard />
    case 'customers':
      return <Customers />
    case 'visits':
      return <Visits />
    case 'map':
      return <Maps />
    case 'communications':
      return <Communications />
    case 'dataImport':
      return <DataImport />
    case 'bulkCustomerImport':
      return <BulkCustomerImport />
    case 'customerVerification':
      return <CustomerVerification />
    case 'settings':
      return <Settings />
    default:
      return <Dashboard />
  }
}

function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-blue-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white">Cargando...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <AuthContainer />
  }

  return (
    <Layout>
      <CurrentPage />
    </Layout>
  )
}

export default App
