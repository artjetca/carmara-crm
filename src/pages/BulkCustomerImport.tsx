import React, { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Upload, Users, CheckCircle, AlertCircle, Download, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface CustomerData {
  name: string
  company?: string
  phone?: string
  email?: string
  address?: string
  city?: string
  province?: string
  contract?: string
  notes?: string
  postal_code?: string
}

interface ImportResults {
  success: number
  failed: number
  errors: string[]
}

interface DeleteResults {
  success: number
  failed: number
  errors: string[]
}

const BulkCustomerImport: React.FC = () => {
  const { user } = useAuth()
  const [importing, setImporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [importResults, setImportResults] = useState<ImportResults | null>(null)
  const [deleteResults, setDeleteResults] = useState<DeleteResults | null>(null)
  const [selectedCustomers, setSelectedCustomers] = useState<Set<number>>(new Set())
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [debugInfo, setDebugInfo] = useState<{
    allCustomerNames: string[]
    first10Customers: any[]
    showDebug: boolean
  }>({ allCustomerNames: [], first10Customers: [], showDebug: false })
  const [loadingDebug, setLoadingDebug] = useState(false)

  // 工具函数：规范化城市，仅允许 Cádiz/Huelva
  const normalizeCity = (input?: string): string | undefined => {
    if (!input) return undefined
    const v = input
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
    if (v === 'cadiz') return 'Cádiz'
    if (v === 'huelva') return 'Huelva'
    return undefined
  }

  // 工具函数：清洗并验证西班牙手机号（6/7/8/9开头9位）
  const sanitizePhone = (input?: string): string | null => {
    if (!input) return null
    const digits = input.replace(/\D/g, '')
    return /^[6789]\d{8}$/.test(digits) ? digits : null
  }
  // Datos de ejemplo extraídos de la imagen
  const imageCustomerData: CustomerData[] = [
    {
      name: 'ABACERÍA HERMANOS CARO',
      phone: '959240066',
      address: 'CALLE DOCTOR RUBIO 2',
      city: 'HUELVA',
      province: 'HUELVA',
      postal_code: '21001'
    },
    {
      name: 'ABACERÍA MARISOL',
      phone: '959240066',
      address: 'CALLE DOCTOR RUBIO 2',
      city: 'HUELVA',
      province: 'HUELVA',
      postal_code: '21001'
    },
    {
      name: 'ACEITES BORGES PONT, S.A.U.',
      phone: '973500150',
      address: 'AVENIDA BORGES 1',
      city: 'TÀRREGA',
      province: 'LLEIDA',
      postal_code: '25300'
    },
    {
      name: 'ACEITES Y VINAGRES DEL SUR',
      phone: '954123456',
      address: 'CALLE INDUSTRIA 10',
      city: 'SEVILLA',
      province: 'SEVILLA',
      postal_code: '41010'
    },
    {
      name: 'ACEITUNERA DEL SUR',
      phone: '957654321',
      address: 'CARRETERA CÓRDOBA KM 5',
      city: 'CÓRDOBA',
      province: 'CÓRDOBA',
      postal_code: '14005'
    },
    {
      name: 'AGRO SEVILLA ACEITUNAS',
      phone: '954987654',
      address: 'POLÍGONO INDUSTRIAL SUR',
      city: 'SEVILLA',
      province: 'SEVILLA',
      postal_code: '41020'
    },
    {
      name: 'ALIMENTACIÓN GARCÍA',
      phone: '959876543',
      address: 'PLAZA MAYOR 6',
      city: 'HUELVA',
      province: 'HUELVA',
      postal_code: '21003'
    },
    {
      name: 'ALIMENTACIÓN HERMANOS LÓPEZ',
      phone: '959345678',
      address: 'CALLE COMERCIO 23',
      city: 'HUELVA',
      province: 'HUELVA',
      postal_code: '21002'
    },
    {
      name: 'ALIMENTACIÓN PÉREZ',
      phone: '959567890',
      address: 'AVENIDA ANDALUCÍA 45',
      city: 'HUELVA',
      province: 'HUELVA',
      postal_code: '21004'
    },
    {
      name: 'ALIMENTACIÓN RODRÍGUEZ',
      phone: '959234567',
      address: 'CALLE NUEVA 12',
      city: 'HUELVA',
      province: 'HUELVA',
      postal_code: '21005'
    }
  ]

  const handleSelectCustomer = (index: number) => {
    const newSelected = new Set(selectedCustomers)
    if (newSelected.has(index)) {
      newSelected.delete(index)
    } else {
      newSelected.add(index)
    }
    setSelectedCustomers(newSelected)
  }

  const handleSelectAll = () => {
    if (selectedCustomers.size === imageCustomerData.length) {
      setSelectedCustomers(new Set())
    } else {
      setSelectedCustomers(new Set(imageCustomerData.map((_, index) => index)))
    }
  }

  const handleClearAll = () => {
    // Seleccionar automáticamente todos los clientes
    setSelectedCustomers(new Set(imageCustomerData.map((_, index) => index)))
    // Activar diálogo de confirmación de eliminación
    setShowDeleteConfirm(true)
  }

  const loadDebugInfo = async () => {
    setLoadingDebug(true)
    try {
      // 获取所有客户名称
      const { data: allCustomers, error: allError } = await supabase
        .from('customers')
        .select('name')
        .order('name')

      if (allError) {
        console.error('Error loading all customers:', allError)
        toast.error('Error al cargar la lista de clientes')
        return
      }

      // 获取前10个客户的详细信息
      const { data: first10, error: first10Error } = await supabase
        .from('customers')
        .select('id, name, phone, email, company, created_by, created_at')
        .order('created_at', { ascending: false })
        .limit(10)

      if (first10Error) {
        console.error('Error loading first 10 customers:', first10Error)
        toast.error('Error al cargar los primeros 10 clientes')
        return
      }

      setDebugInfo({
        allCustomerNames: allCustomers?.map(c => c.name) || [],
        first10Customers: first10 || [],
        showDebug: true
      })

      console.log('=== INFORMACIÓN DE DEPURACIÓN ===')
      console.log('Total de clientes en la base de datos:', allCustomers?.length || 0)
      console.log('Nombres de todos los clientes:', allCustomers?.map(c => c.name))
      console.log('Primeros 10 clientes:', first10)
      console.log('Clientes a eliminar:', imageCustomerData.filter((_, index) => selectedCustomers.has(index)).map(c => c.name))
      
    } catch (error) {
      console.error('Error loading debug info:', error)
      toast.error('Error al cargar información de depuración')
    } finally {
      setLoadingDebug(false)
    }
  }

  const toggleDebugInfo = () => {
    if (debugInfo.showDebug) {
      setDebugInfo(prev => ({ ...prev, showDebug: false }))
    } else {
      loadDebugInfo()
    }
  }

  const handleBulkDelete = async () => {
    if (!user) {
      toast.error('Usuario no autenticado')
      return
    }

    setDeleting(true)
    setShowDeleteConfirm(false)
    
    // Cargar información de depuración antes de eliminar
    await loadDebugInfo()
    
    const results: DeleteResults = {
      success: 0,
      failed: 0,
      errors: []
    }

    try {
      for (const index of selectedCustomers) {
        const customer = imageCustomerData[index]
        
        try {
          console.log('Intentando eliminar cliente:', {
            name: customer.name,
            phone: customer.phone,
            company: customer.company
          })

          // Buscar el cliente usando múltiples estrategias
          let existingCustomers = null
          let searchError = null

          console.log('Usuario actual ID:', user.id)

          // Estrategia 1: Buscar por nombre exacto (sin filtro de usuario)
          const { data: customersByName, error: nameError } = await supabase
            .from('customers')
            .select('id, name, phone, company, created_by')
            .eq('name', customer.name)

          if (nameError) {
            console.error('Error buscando por nombre:', nameError)
          } else if (customersByName && customersByName.length > 0) {
            existingCustomers = customersByName
            console.log('Cliente encontrado por nombre exacto:', customersByName)
            console.log('created_by values:', customersByName.map(c => c.created_by))
          }

          // Estrategia 2: Si no se encuentra, buscar por nombre usando ILIKE (insensible a mayúsculas)
          if (!existingCustomers || existingCustomers.length === 0) {
            const { data: customersByIlike, error: ilikeError } = await supabase
              .from('customers')
              .select('id, name, phone, company, created_by')
              .ilike('name', customer.name)

            if (ilikeError) {
              console.error('Error buscando con ILIKE:', ilikeError)
            } else if (customersByIlike && customersByIlike.length > 0) {
              existingCustomers = customersByIlike
              console.log('Cliente encontrado con ILIKE:', customersByIlike)
              console.log('created_by values:', customersByIlike.map(c => c.created_by))
            }
          }

          // Estrategia 3: Si aún no se encuentra, buscar por nombre parcial
          if (!existingCustomers || existingCustomers.length === 0) {
            const { data: customersByPartial, error: partialError } = await supabase
              .from('customers')
              .select('id, name, phone, company, created_by')
              .ilike('name', `%${customer.name}%`)

            if (partialError) {
              console.error('Error buscando parcialmente:', partialError)
            } else if (customersByPartial && customersByPartial.length > 0) {
              existingCustomers = customersByPartial
              console.log('Cliente encontrado parcialmente:', customersByPartial)
              console.log('created_by values:', customersByPartial.map(c => c.created_by))
            }
          }

          if (existingCustomers && existingCustomers.length > 0) {
            // Eliminar el cliente
            const { error: deleteError } = await supabase
              .from('customers')
              .delete()
              .eq('id', existingCustomers[0].id)

            if (deleteError) {
              throw deleteError
            }

            console.log('Cliente eliminado exitosamente:', existingCustomers[0])
            results.success++
          } else {
            console.log('Cliente no encontrado en la base de datos:', customer)
            results.failed++
            results.errors.push(`Cliente "${customer.name}" no encontrado en la base de datos`)
          }
        } catch (error) {
          console.error('Error al eliminar cliente:', error)
          results.failed++
          results.errors.push(`Error al eliminar "${customer.name}": ${error instanceof Error ? error.message : 'Error desconocido'}`)
        }
      }

      setDeleteResults(results)
      setSelectedCustomers(new Set())
      
      if (results.success > 0) {
        toast.success(`${results.success} cliente${results.success > 1 ? 's' : ''} eliminado${results.success > 1 ? 's' : ''} correctamente`)
      }
      
      if (results.failed > 0) {
        toast.error(`${results.failed} cliente${results.failed > 1 ? 's' : ''} no se pudieron eliminar`)
      }
    } catch (error) {
      console.error('Error en eliminación masiva:', error)
      toast.error('Error durante la eliminación masiva')
    } finally {
      setDeleting(false)
    }
  }

  const downloadDeleteErrorReport = () => {
    if (!deleteResults || deleteResults.errors.length === 0) return

    const errorReport = deleteResults.errors.join('\n')
    const blob = new Blob([errorReport], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `errores-eliminacion-${new Date().toISOString().split('T')[0]}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleBulkImport = async () => {
    if (!user) {
      toast.error('Usuario no autenticado')
      return
    }

    setImporting(true)
    setImportResults(null)
    
    // 确保当前用户的perfil存在于 user_profiles/profiles 表，以满足 customers.created_by 外键
    try {
      const payload = {
        id: user.id,
        email: user.email || '',
        full_name: (user as any)?.user_metadata?.full_name || ''
      }
      const { error: upsertUserProfilesError } = await supabase
        .from('user_profiles')
        .upsert(payload, { onConflict: 'id' })
  
      if (upsertUserProfilesError) {
        await supabase.from('profiles').upsert(payload, { onConflict: 'id' })
      }
    } catch (e) {
      console.warn('No se pudo asegurar el perfil del usuario antes de importar, se intenta continuar:', e)
    }
    
    const results: ImportResults = {
      success: 0,
      failed: 0,
      errors: []
    }

    try {
      for (const customer of imageCustomerData) {
        try {
          const normalizedCity = normalizeCity(customer.city)
          const validPhone = sanitizePhone(customer.phone)

          const { error } = await supabase
            .from('customers')
            .insert({
              name: customer.name,
              company: customer.company || '',
              phone: validPhone,
              email: customer.email || '',
              address: customer.address || '',
              city: normalizedCity || undefined, // 若无法识别，则使用表默认值
              // province 字段在数据库中不存在，移除
              contrato: customer.contract || '',
              notes: customer.notes || '',
              postal_code: customer.postal_code || '',
              created_by: user.id
            })

          if (error) {
            throw error
          }

          results.success++
        } catch (error) {
          results.failed++
          results.errors.push(`Error al importar "${customer.name}": ${error instanceof Error ? error.message : 'Error desconocido'}`)
        }
      }

      setImportResults(results)
      
      if (results.success > 0) {
        toast.success(`${results.success} cliente${results.success > 1 ? 's' : ''} importado${results.success > 1 ? 's' : ''} correctamente`)
      }
      
      if (results.failed > 0) {
        toast.error(`${results.failed} cliente${results.failed > 1 ? 's' : ''} no se pudieron importar`)
      }
    } catch (error) {
      console.error('Error en importación masiva:', error)
      toast.error('Error durante la importación masiva')
    } finally {
      setImporting(false)
    }
  }

  const downloadErrorReport = () => {
    if (!importResults || importResults.errors.length === 0) return

    const errorReport = importResults.errors.join('\n')
    const blob = new Blob([errorReport], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `errores-importacion-${new Date().toISOString().split('T')[0]}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <div className="flex items-center space-x-3 mb-4">
          <div className="bg-blue-500 p-3 rounded-lg">
            <Upload className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Importación Masiva de Clientes
            </h1>
            <p className="text-gray-600">
              Importar clientes desde los datos de la imagen proporcionada
            </p>
          </div>
        </div>
      </div>

      {/* Data Preview */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
          <Users className="w-5 h-5" />
          <span>Vista Previa de Datos ({imageCustomerData.length} clientes)</span>
        </h2>
        
        <div className="space-y-4">
          {/* Acciones de selección */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={selectedCustomers.size === imageCustomerData.length && imageCustomerData.length > 0}
                  onChange={handleSelectAll}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">
                  Seleccionar todos ({selectedCustomers.size}/{imageCustomerData.length})
                </span>
              </label>
            </div>
            <div className="flex items-center space-x-3">
              {selectedCustomers.size > 0 && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={deleting}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {deleting ? 'Eliminando...' : `Eliminar ${selectedCustomers.size} cliente${selectedCustomers.size > 1 ? 's' : ''}`}
                </button>
              )}
              
              {imageCustomerData.length > 0 && (
                <button
                  onClick={handleClearAll}
                  disabled={deleting}
                  className="inline-flex items-center px-4 py-2 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {deleting ? 'Eliminando...' : `Eliminar todos los ${imageCustomerData.length} clientes`}
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Seleccionar
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nombre
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Teléfono
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Dirección
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ciudad
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Provincia
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Código Postal
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {imageCustomerData.slice(0, 10).map((customer, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedCustomers.has(index)}
                        onChange={() => handleSelectCustomer(index)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {customer.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {customer.phone || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {customer.address || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {customer.city || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {customer.province || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {customer.postal_code || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {imageCustomerData.length > 10 && (
              <div className="mt-4 text-center text-sm text-gray-500">
                ... y {imageCustomerData.length - 10} clientes más
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Import Actions */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Acciones de Importación
        </h2>
        
        <div className="space-y-4">
          <button
            onClick={handleBulkImport}
            disabled={importing}
            className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {importing ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Importando...</span>
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                <span>Importar {imageCustomerData.length} Clientes</span>
              </>
            )}
          </button>
          
          <button
            onClick={toggleDebugInfo}
            disabled={loadingDebug}
            className="w-full bg-yellow-600 text-white px-6 py-3 rounded-lg hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {loadingDebug ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Cargando información de depuración...</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-5 h-5" />
                <span>{debugInfo.showDebug ? 'Ocultar' : 'Mostrar'} Información de Depuración</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Confirmación de eliminación */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3 text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                <AlertCircle className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg leading-6 font-medium text-gray-900 mt-4">
                Confirmar eliminación
              </h3>
              <div className="mt-2 px-7 py-3">
                <p className="text-sm text-gray-500">
                  {selectedCustomers.size === imageCustomerData.length ? 
                    `¿Estás seguro de que quieres eliminar todos los ${selectedCustomers.size} clientes? Esta acción no se puede deshacer.` :
                    `¿Estás seguro de que quieres eliminar ${selectedCustomers.size} cliente${selectedCustomers.size > 1 ? 's' : ''}? Esta acción no se puede deshacer.`
                  }
                </p>
              </div>
              <div className="flex gap-4 px-4 py-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="flex-1 bg-red-600 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Results */}
      {importResults && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Resultados de la Importación
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="flex items-center space-x-3 p-4 bg-green-50 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <div>
                <p className="font-medium text-green-900">Exitosos</p>
                <p className="text-2xl font-bold text-green-600">{importResults.success}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3 p-4 bg-red-50 rounded-lg">
              <AlertCircle className="w-6 h-6 text-red-600" />
              <div>
                <p className="font-medium text-red-900">Fallidos</p>
                <p className="text-2xl font-bold text-red-600">{importResults.failed}</p>
              </div>
            </div>
          </div>

          {importResults.errors.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-gray-900">Errores de Importación</h3>
                <button
                  onClick={downloadErrorReport}
                  className="flex items-center space-x-2 text-blue-600 hover:text-blue-800"
                >
                  <Download className="w-4 h-4" />
                  <span>Descargar Reporte</span>
                </button>
              </div>
              
              <div className="max-h-40 overflow-y-auto bg-red-50 rounded-lg p-4">
                {importResults.errors.map((error, index) => (
                  <p key={index} className="text-sm text-red-700 mb-1">
                    {error}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete Results */}
      {deleteResults && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Resultados de la Eliminación
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="flex items-center space-x-3 p-4 bg-green-50 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <div>
                <p className="font-medium text-green-900">Exitosos</p>
                <p className="text-2xl font-bold text-green-600">{deleteResults.success}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3 p-4 bg-red-50 rounded-lg">
              <AlertCircle className="w-6 h-6 text-red-600" />
              <div>
                <p className="font-medium text-red-900">Fallidos</p>
                <p className="text-2xl font-bold text-red-600">{deleteResults.failed}</p>
              </div>
            </div>
          </div>

          {deleteResults.errors.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-gray-900">Errores de Eliminación</h3>
                <button
                  onClick={downloadDeleteErrorReport}
                  className="flex items-center space-x-2 text-blue-600 hover:text-blue-800"
                >
                  <Download className="w-4 h-4" />
                  <span>Descargar Reporte</span>
                </button>
              </div>
              
              <div className="max-h-40 overflow-y-auto bg-red-50 rounded-lg p-4">
                {deleteResults.errors.map((error, index) => (
                  <p key={index} className="text-sm text-red-700 mb-1">
                    {error}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Debug Information */}
      {debugInfo.showDebug && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Información de Depuración
          </h2>
          
          <div className="space-y-6">
            {/* Comparación de nombres */}
            <div>
              <h3 className="font-medium text-gray-900 mb-3">Comparación de Nombres</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <h4 className="font-medium text-blue-900 mb-2">Clientes a eliminar ({imageCustomerData.filter((_, index) => selectedCustomers.has(index)).length})</h4>
                  <div className="max-h-40 overflow-y-auto">
                    {imageCustomerData.filter((_, index) => selectedCustomers.has(index)).map((customer, index) => (
                      <p key={index} className="text-sm text-blue-700 mb-1">
                        {customer.name}
                      </p>
                    ))}
                  </div>
                </div>
                
                <div className="bg-green-50 rounded-lg p-4">
                  <h4 className="font-medium text-green-900 mb-2">Clientes en la base de datos ({debugInfo.allCustomerNames.length})</h4>
                  <div className="max-h-40 overflow-y-auto">
                    {debugInfo.allCustomerNames.slice(0, 20).map((name, index) => (
                      <p key={index} className="text-sm text-green-700 mb-1">
                        {name}
                      </p>
                    ))}
                    {debugInfo.allCustomerNames.length > 20 && (
                      <p className="text-sm text-green-600 italic">... y {debugInfo.allCustomerNames.length - 20} más</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Primeros 10 clientes */}
            <div>
              <h3 className="font-medium text-gray-900 mb-3">Últimos 10 clientes en la base de datos</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Teléfono</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Creado por</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {debugInfo.first10Customers.map((customer, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{customer.id}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{customer.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{customer.phone || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{customer.email || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{customer.created_by || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {customer.created_at ? new Date(customer.created_at).toLocaleDateString() : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* Coincidencias exactas */}
            <div>
              <h3 className="font-medium text-gray-900 mb-3">Análisis de Coincidencias</h3>
              <div className="bg-gray-50 rounded-lg p-4">
                {imageCustomerData.filter((_, index) => selectedCustomers.has(index)).map((customer, index) => {
                  const exactMatch = debugInfo.allCustomerNames.find(name => name === customer.name)
                  const partialMatches = debugInfo.allCustomerNames.filter(name => 
                    name.toLowerCase().includes(customer.name.toLowerCase()) || 
                    customer.name.toLowerCase().includes(name.toLowerCase())
                  )
                  
                  return (
                    <div key={index} className="mb-3 p-3 bg-white rounded border">
                      <p className="font-medium text-gray-900">{customer.name}</p>
                      {exactMatch ? (
                        <p className="text-sm text-green-600">✓ Coincidencia exacta encontrada</p>
                      ) : partialMatches.length > 0 ? (
                        <div>
                          <p className="text-sm text-yellow-600">⚠ Coincidencias parciales ({partialMatches.length}):</p>
                          {partialMatches.slice(0, 3).map((match, i) => (
                            <p key={i} className="text-xs text-gray-600 ml-4">• {match}</p>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-red-600">✗ No se encontraron coincidencias</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BulkCustomerImport