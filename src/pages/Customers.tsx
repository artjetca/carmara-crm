import React, { useState, useEffect, useRef } from 'react'
import { Upload, Download, Trash2, Plus, Search, Building, Edit } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useStore } from '../store/useStore'
import { supabase, Customer } from '../lib/supabase'
import { translations } from '../lib/translations'

export default function Customers() {
  const { user } = useAuth()
  const { customers, setCustomers, importHighlightSince, setCurrentPage } = useStore()
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCity, setSelectedCity] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const headerCheckboxRef = useRef<HTMLInputElement>(null)
  const t = translations

  useEffect(() => {
    if (!user?.id) return
    loadCustomers()
  }, [user?.id])

  // 导入按钮：跳转到“Importación de Datos”页面
  const handleImportClick = () => {
    setCurrentPage('dataImport')
  }

  // 从备注中提取“Ciudad: xxx”作为 municipio
  const extractMunicipality = (notes?: string): string => {
    if (!notes) return ''
    const match = notes.match(/Ciudad:\s*([^\n]+)/i)
    return match ? match[1].trim() : ''
  }

  // 从备注中提取“Provincia: xxx”
  const extractProvince = (notes?: string): string => {
    if (!notes) return ''
    const match = notes.match(/Provincia:\s*([^\n]+)/i)
    return match ? match[1].trim() : ''
  }

  // 导出当前筛选结果为 CSV
  const handleExportClick = () => {
    const rows = filteredCustomers
    const header = ['nombre','empresa','teléfono','email','dirección','ciudad','provincia','contrato','notas']

    const csvEscape = (v: any) => {
      const s = v === null || v === undefined ? '' : String(v)
      return '"' + s.replace(/"/g, '""') + '"'
    }

    const lines = [header.join(',')]

    rows.forEach((c) => {
      const isProvinceInCityField = c.city === 'Cádiz' || c.city === 'Huelva'
      const provincia = isProvinceInCityField ? (c.city || '') : (extractProvince(c.notes) || '')
      const municipioFromNotes = extractMunicipality(c.notes)
      const municipio = municipioFromNotes || (!isProvinceInCityField ? (c.city || '') : '')
      const contrato = (c as any).contrato || ''
      const line = [
        csvEscape(c.name),
        csvEscape(c.company || ''),
        csvEscape(c.phone || c.mobile_phone || ''),
        csvEscape(c.email || ''),
        csvEscape(c.address || ''),
        csvEscape(municipio), // ciudad => municipio 以便后续可无损导入
        csvEscape(provincia),
        csvEscape(contrato),
        csvEscape(c.notes || '')
      ].join(',')
      lines.push(line)
    })

    const csvContent = lines.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const today = new Date().toISOString().split('T')[0]
    a.href = url
    a.download = `clientes_${today}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // loadCustomers 函數內
  const loadCustomers = async () => {
    if (!user?.id) {
      setCustomers([])
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false })
      
      if (error) throw error
      setCustomers(data || [])
    } catch (error) {
      console.error('Error loading customers:', error)
    } finally {
      setLoading(false)
    }
  }

  const deleteCustomer = async (id: string) => {
     try {
       const { error } = await supabase
         .from('customers')
         .delete()
         .eq('id', id)
       
       if (error) throw error
       setCustomers(customers.filter(c => c.id !== id))
       // 從已選取中移除
       setSelectedIds(prev => {
         const next = new Set(prev)
         next.delete(id)
         return next
       })
     } catch (error) {
       console.error('Error deleting customer:', error)
       alert(t.customers.deleteError)
     }
   }

  // 行選取/全選處理
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllVisible = () => {
    const visibleIds = filteredCustomers.map(c => c.id)
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id))
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allSelected) {
        visibleIds.forEach(id => next.delete(id))
      } else {
        visibleIds.forEach(id => next.add(id))
      }
      return next
    })
  }

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    // 改為使用站內確認窗，避免瀏覽器封鎖或被忽略
    setShowBulkConfirm(true)
  }

  // 真正執行刪除（分批執行，避免過大 IN 列表）
  const doBulkDelete = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) { setShowBulkConfirm(false); return }
    try {
      setBulkDeleting(true)
      const chunkSize = 200
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize)
        const { error } = await supabase
          .from('customers')
          .delete()
          .in('id', chunk)
        if (error) throw error
      }
      setCustomers(prev => prev.filter(c => !selectedIds.has(c.id)))
      setSelectedIds(new Set())
      setShowBulkConfirm(false)
    } catch (err) {
      console.error('Error bulk deleting customers:', err)
      alert(t.customers.deleteError || 'Error eliminando clientes')
    } finally {
      setBulkDeleting(false)
    }
  }

  const highlightSinceDate = importHighlightSince ? new Date(importHighlightSince) : null
  const isHighlighted = (c: Customer) => {
    if (!highlightSinceDate) return false
    try {
      return new Date((c as any).created_at) >= highlightSinceDate
    } catch {
      return false
    }
  }

  const filteredCustomers = customers.filter(customer => {
    const matchesSearch = customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         customer.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         customer.email?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCity = !selectedCity || customer.city === selectedCity
    return matchesSearch && matchesCity
  })

  const cities = Array.from(new Set(customers.map(c => c.city).filter(Boolean)))

  // 是否全選目前可見清單
  const allVisibleSelected = filteredCustomers.length > 0 && filteredCustomers.every(c => selectedIds.has(c.id))

  // 設定表頭核取方塊為不確定狀態
  useEffect(() => {
    if (!headerCheckboxRef.current) return
    const visibleIds = filteredCustomers.map(c => c.id)
    const selectedVisible = visibleIds.filter(id => selectedIds.has(id)).length
    headerCheckboxRef.current.indeterminate = selectedVisible > 0 && selectedVisible < visibleIds.length
  }, [selectedIds, filteredCustomers])

  const highlightedCount = highlightSinceDate
    ? customers.filter(isHighlighted).length
    : 0

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t.customers.title}</h1>
          <p className="text-gray-600">{t.customers.subtitle}</p>
        </div>
        <div className="flex items-center space-x-3">
          <button onClick={handleImportClick} className="inline-flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
            <Upload className="w-4 h-4" />
            <span>{t.customers.import}</span>
          </button>
          <button onClick={handleExportClick} className="inline-flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
            <Download className="w-4 h-4" />
            <span>{t.customers.export}</span>
          </button>
          {selectedIds.size > 0 && (
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="inline-flex items-center space-x-2 px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-60"
            >
              <Trash2 className="w-4 h-4" />
              <span>{bulkDeleting ? 'Eliminando…' : `Eliminar (${selectedIds.size})`}</span>
            </button>
          )}
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            <span>{t.customers.addCustomer}</span>
          </button>
        </div>
      </div>

      {/* Banner: 高亮提示 */}
      {highlightSinceDate && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-900 rounded-lg p-4 flex items-center justify-between">
          <div>
            Registros importados resaltados: {highlightedCount}.
          </div>
          <button
            onClick={clearImportHighlight}
            className="text-yellow-900 border border-yellow-300 px-3 py-1 rounded hover:bg-yellow-100"
          >
            Limpiar resaltado
          </button>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder={t.customers.searchPlaceholder}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="sm:w-48">
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">{t.customers.allCities}</option>
              {cities.map(city => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Lista de clientes */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {filteredCustomers.length === 0 ? (
          <div className="text-center py-12">
            <Building className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {customers.length === 0 ? t.customers.noCustomers : t.customers.noResults}
            </h3>
            <p className="text-gray-600 mb-4">
              {customers.length === 0 ? t.customers.addFirstCustomer : t.customers.tryDifferentSearch}
            </p>
            {customers.length === 0 && (
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                <span>{t.customers.addCustomer}</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                    <input
                      ref={headerCheckboxRef}
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={selectAllVisible}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t.customers.name}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t.customers.company}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t.customers.phone}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t.customers.email}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t.customers.address}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t.customers.province}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t.customers.city}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contrato
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t.common.actions}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredCustomers.map((customer) => {
                  const isProvinceInCityField = customer.city === 'Cádiz' || customer.city === 'Huelva'
                  const provincia = isProvinceInCityField ? (customer.city || '') : (extractProvince(customer.notes) || '')
                  const municipio = extractMunicipality(customer.notes) || (!isProvinceInCityField ? (customer.city || '') : '')
                  const contrato = (customer as any).contrato || ''
                  
                  return (
                    <tr 
                      key={customer.id} 
                      className={`hover:bg-gray-50 ${isHighlighted(customer) ? 'bg-yellow-50' : ''}`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap w-10">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(customer.id)}
                          onChange={() => toggleSelect(customer.id)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{customer.name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-600">{customer.company || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-600">{customer.phone || customer.mobile_phone || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-600">{customer.email || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-600">{customer.address || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-600">{provincia || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-600">{municipio || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-600">{contrato || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => deleteCustomer(customer.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{extractMunicipality(customer.notes) || ((customer.city !== 'Cádiz' && customer.city !== 'Huelva') ? (customer.city || '') : '')}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600">{customer.phone || customer.mobile_phone || '-'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleEditCustomer(customer)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteCustomer(customer.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
