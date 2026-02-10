import React, { useState, useEffect, useRef } from 'react'
import { Upload, Download, Trash2, Plus, Search, Building, Edit, X } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useStore } from '../store/useStore'
import { supabase, Customer } from '../lib/supabase'
import { translations } from '../lib/translations'

export default function Customers() {
  const { user } = useAuth()
  const { customers, setCustomers, importHighlightSince, setCurrentPage, clearImportHighlight } = useStore()
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProvince, setSelectedProvince] = useState('')
  const [selectedCity, setSelectedCity] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [editData, setEditData] = useState<Partial<Customer>>({})
  const [editProvince, setEditProvince] = useState<string>('')
  const [editMunicipio, setEditMunicipio] = useState<string>('')
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

  // 清除備註中的 "Provincia: ..." 與 "Ciudad: ..." 標籤（支持以 \n 或 " | " 拼接的舊資料）
  const stripLocationTags = (notes?: string): string => {
    if (!notes) return ''
    let s = notes
    // 移除以管線拼接的片段，例如 " | Provincia: Huelva" 或 "| Ciudad: Bonares"
    s = s.replace(/\s*\|\s*Provincia:\s*[^|\n]+/gi, '')
         .replace(/\s*\|\s*Ciudad:\s*[^|\n]+/gi, '')
    // 移除獨立行的片段
    s = s.replace(/(^|\n)\s*Provincia:\s*[^\n]+/gi, '')
         .replace(/(^|\n)\s*Ciudad:\s*[^\n]+/gi, '')
    // 清理多餘的分隔符與空白
    s = s.replace(/\s*\|\s*/g, ' | ').replace(/^(\s*\|\s*)+|(\s*\|\s*)+$/g, '')
    return s.trim()
  }

  // 从文本中提取邮递区号 (西班牙格式: 5位数字)
  const extractPostalCode = (text?: string): string => {
    if (!text) return ''
    const match = text.match(/\b(\d{5})\b/)
    return match ? match[1] : ''
  }

  // 导出当前筛选结果为 CSV
  const handleExportClick = () => {
    const rows = filteredAndSortedCustomers
    const header = ['numero','nombre','empresa','teléfono','email','dirección','C.P','ciudad','provincia','contrato','notas']

    const csvEscape = (v: any) => {
      const s = v === null || v === undefined ? '' : String(v)
      return '"' + s.replace(/"/g, '""') + '"'
    }

    const lines = [header.join(',')]

    rows.forEach((c, index) => {
      const isProvinceInCityField = c.city === 'Cádiz' || c.city === 'Huelva'
      const provincia = isProvinceInCityField
        ? (c.city || '')
        : ((c.province || '') || (extractProvince(c.notes) || ''))
      const municipioFromNotes = extractMunicipality(c.notes)
      const municipio = (!isProvinceInCityField ? (c.city || '') : '') || municipioFromNotes
      const contrato = (c as any).contrato || ''
      const cleanNotes = stripLocationTags(c.notes as string)
      
      // 從地址或notes中提取郵遞區號
      const postalCode = (c as any).postal_code || extractPostalCode(c.address) || extractPostalCode(cleanNotes) || ''
      
      const line = [
        csvEscape(((c as any).numero ?? (c as any).num) || ''), // número (prefer numero for import)
        csvEscape(c.name),
        csvEscape(c.company || ''),
        csvEscape(c.phone || c.mobile_phone || ''),
        csvEscape(c.email || ''),
        csvEscape(c.address || ''),
        csvEscape(postalCode),
        csvEscape(municipio), // ciudad => municipio 以便后续可无损导入
        csvEscape(provincia),
        csvEscape(contrato),
        csvEscape(cleanNotes)
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
  const [unownedWarning, setUnownedWarning] = useState<string>('')

  const loadCustomers = async () => {
    if (!user?.id) {
      setCustomers([])
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      
      const response = await fetch('/api/customers', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      })

      const result = await response.json()
      
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to load customers')
      }

      let rows = result.data || []

      // 過濾只顯示當前用戶創建的客戶
      const userCustomers = rows.filter((customer: any) => customer.created_by === user.id)
      
      // 如果為 0 筆，顯示所有客戶（容錯）
      if (userCustomers.length === 0 && rows.length > 0) {
        console.warn('[Customers] No customers for current user. Showing all customers.')
        setUnownedWarning('已載入未歸屬於你帳號的客戶（created_by 不匹配）。')
        setCustomers(rows)
      } else {
        setCustomers(userCustomers)
      }
    } catch (error) {
      console.error('Error loading customers:', error)
    } finally {
      setLoading(false)
    }
  }

  const deleteCustomer = async (id: string) => {
     try {
       const response = await fetch('/api/customers', {
         method: 'DELETE',
         headers: {
           'Content-Type': 'application/json',
         },
         body: JSON.stringify({ id })
       })

       const result = await response.json()
       
       if (!response.ok || !result.success) {
         throw new Error(result.error || 'Failed to delete customer')
       }
       
       // 從列表中移除該客戶
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

  // 編輯相關
  const handleEditOpen = (c: Customer) => {
    setEditingCustomer(c)
    
    // 分離用戶的notes和省市資訊
    const cleanNotes = stripLocationTags(c.notes as string)
    // 初始化 C.P（postal_code）：優先使用欄位，其次嘗試從地址/備註中提取 5 位數
    const initialPostalCode = (c as any).postal_code || extractPostalCode(c.address) || extractPostalCode(cleanNotes) || ''
    
    setEditData({
      name: c.name,
      company: c.company,
      phone: c.phone,
      email: c.email,
      address: c.address,
      postal_code: initialPostalCode,
      city: c.city,
      notes: cleanNotes as any,
      contrato: (c as any).contrato || '',
      // 初始化 Número：優先使用 num，否則 fallback 到 numero
      ...(typeof (c as any).num !== 'undefined' ? { num: (c as any).num } : {}),
      ...((typeof (c as any).num === 'undefined' && typeof (c as any).numero !== 'undefined') ? { num: (c as any).numero } : {}),
    })
    
    // 初始化省/市選擇 - 修復邏輯
    let prov = ''
    let muni = ''
    
    // 優先使用 province 欄位
    if ((c as any).province) {
      prov = (c as any).province
      muni = c.city || ''
    } else {
      // 沒有 province 欄位時，從 city 和 notes 推斷
      const extractedProv = extractProvince(c.notes)
      const extractedMuni = extractMunicipality(c.notes)
      
      if (extractedProv) {
        prov = extractedProv
        muni = extractedMuni || c.city || ''
      } else if (c.city === 'Cádiz' || c.city === 'Huelva' || c.city === 'Ceuta') {
        // city 是省份名時
        prov = c.city
        muni = c.city
      } else if (c.city) {
        // city 不是省份名，需要找到對應的省份
        muni = c.city
        // 查找城市屬於哪個省份 - 使用大小寫不敏感比較
        let foundProvince = ''
        for (const [provinceName, cities] of Object.entries(municipiosByProvince)) {
          if (cities.some(city => city.toLowerCase() === c.city.toLowerCase())) {
            foundProvince = provinceName
            break
          }
        }
        prov = foundProvince || extractedProv || 'Huelva' // 預設為 Huelva 省份
      }
    }
    
    setEditProvince(prov)
    setEditMunicipio(muni)
  }

  const handleEditChange = (
    field: keyof Customer | 'contrato' | 'notes' | 'num',
    value: string
  ) => {
    setEditData(prev => ({ ...prev, [field]: value }))
  }

  const handleEditSave = async () => {
    if (!editingCustomer) return
    try {
      // 使用 API 端點更新客戶，避免 schema cache 問題
      const updateData: any = {
        name: editData.name,
        company: editData.company,
        phone: editData.phone,
        email: editData.email,
        address: editData.address,
      }

      // 包含 C.P（postal_code）欄位
      if (editData.postal_code !== undefined) {
        updateData.postal_code = (editData.postal_code || '').trim() || null
      }

      // 包含 Número 欄位
      if ((editData as any).num !== undefined) {
        updateData.num = (editData as any).num || null
      }

      // 計算 city 與 province 欄位 - 修復 Huelva/Cádiz 同名問題
      const hasProvince = Boolean(editProvince && editProvince.trim())
      const hasMunicipio = Boolean(editMunicipio && editMunicipio.trim())
      
      if (hasProvince) {
        updateData.province = editProvince.trim()
        
        if (hasMunicipio) {
          // 有選擇市政區時，city = 市政區名稱
          updateData.city = editMunicipio.trim()
        } else if (editProvince === 'Cádiz' || editProvince === 'Huelva') {
          // 沒有選擇市政區，但省份是 Cádiz 或 Huelva 時，city = 省份名稱
          updateData.city = editProvince.trim()
        } else {
          updateData.city = null
        }
      } else {
        updateData.province = null
        updateData.city = null
      }

      // 不再自動把 省/市 寫進 notes，僅保留使用者輸入
      const userNotes = (editData as any).notes?.trim()
      updateData.notes = userNotes || null

      // 添加 contrato 欄位
      if ((editData as any).contrato !== undefined) {
        updateData.contrato = (editData as any).contrato
      }


      console.log('Updating customer via API with data:', updateData)

      // 使用 API 端點更新
      const response = await fetch(`/api/customers`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: editingCustomer.id, ...updateData })
      })

      if (!response.ok) {
        const errorData = await response.text()
        throw new Error(`API Error: ${response.status} - ${errorData}`)
      }

      const result = await response.json()
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to update customer')
      }

      // 更新前端列表（包含 num 等欄位）
      setCustomers(customers.map(c => (c.id === editingCustomer.id ? { ...c, ...updateData } as Customer : c)))
      setEditingCustomer(null)
      setEditData({})
      setEditProvince('')
      setEditMunicipio('')
    } catch (err: any) {
      console.error('Error actualizando cliente:', err)
      alert(`Error actualizando cliente: ${err.message || err}`)
    }
  }

  const handleEditClose = () => {
    setEditingCustomer(null)
    setEditData({})
    setEditProvince('')
    setEditMunicipio('')
  }

  // 排序狀態
  const [sortField, setSortField] = useState<keyof Customer | ''>('')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')


  const handleProvinceChange = (prov: string) => {
    setEditProvince(prov)
    // 重置城市選擇，讓用戶重新選擇
    setEditMunicipio('')
  }

  const handleMunicipioChange = (muni: string) => {
    setEditMunicipio(muni)
    // 修復城市持久化問題：確保正確設置 city 值
    const cityValue = (editProvince === 'Cádiz' || editProvince === 'Huelva' || editProvince === 'Ceuta') 
      ? (muni || editProvince) 
      : muni
    setEditData(prev => ({ ...prev, city: cityValue }))
  }

  // 新增客戶按鈕
  const handleAddClick = () => {
    setShowAddModal(true)
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
    const visibleIds = filteredAndSortedCustomers.map(c => c.id)
    if (allVisibleSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev)
        visibleIds.forEach(id => next.delete(id))
        return next
      })
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev)
        visibleIds.forEach(id => next.add(id))
        return next
      })
    }
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
      // 使用 API 端點逐個刪除客戶
      for (const id of ids) {
        const response = await fetch('/api/customers', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ id })
        })

        const result = await response.json()
        
        if (!response.ok || !result.success) {
          throw new Error(result.error || `Failed to delete customer ${id}`)
        }
      }
      
      // 以目前列表為基礎，過濾掉被刪除的項目
      setCustomers(customers.filter(c => !selectedIds.has(c.id)))
      // 清空選取狀態
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

  // 處理排序
  const handleSort = (field: keyof Customer) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  // 与地图页面一致的省份显示逻辑
  const isProvinceName = (v?: string) => {
    const s = String(v || '').trim().toLowerCase()
    return s === 'huelva' || s === 'cádiz' || s === 'cadiz' || s === 'ceuta'
  }

  // 省份名稱標準化：無論大小寫/重音，統一為 "Cádiz"、"Huelva" 或 "Ceuta"
  const toCanonicalProvince = (v?: string): string => {
    const s = String(v || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // 去除重音符號
    if (s === 'huelva') return 'Huelva'
    if (s === 'cadiz') return 'Cádiz'
    if (s === 'ceuta') return 'Ceuta'
    return ''
  }

  const displayProvince = (customer: Customer): string => {
    if (!customer) return ''
    try {
      // 优先使用数据表中的province字段
      if ((customer as any).province && String((customer as any).province).trim().length > 0) {
        const can = toCanonicalProvince((customer as any).province)
        if (can) return can
      }
      // 从notes中解析省份
      if (customer.notes) {
        const m = customer.notes.match(/Provincia:\s*([^\n]+)/i)
        if (m) {
          const can = toCanonicalProvince(m[1])
          if (can) return can
        }
      }
      // 最后才检查city是否为省份名称
      if (customer.city && isProvinceName(customer.city)) {
        const can = toCanonicalProvince(customer.city)
        if (can) return can
      }
      return ''
    } catch (error) {
      console.error('[DISPLAY_PROVINCE] Error processing customer:', customer, error)
      return ''
    }
  }

  const displayCity = (customer: Customer): string => {
    if (!customer) return ''
    try {
      // 优先从notes中解析城市
      if (customer.notes) {
        const m = customer.notes.match(/Ciudad:\s*([^\n]+)/i)
        if (m) return m[1].trim()
      }
      
      // 检查city字段
      const city = String(customer.city || '').trim()
      if (city) {
        // 如果city是省份名称，且有对应的province字段，则显示城市名称
        if (isProvinceName(city)) {
          const province = (customer as any).province || ''
          // 如果province和city相同（如Huelva/Huelva），显示城市名称
          if (province === city) {
            return city
          }
          // 否则不显示（避免重复）
          return ''
        }
        // 如果city不是省份名称，直接显示
        return city
      }
      return ''
    } catch (error) {
      console.error('[DISPLAY_CITY] Error processing customer:', customer, error)
      return ''
    }
  }


  // Provincias disponibles - 移到前面定義
  const provinces = ['Cádiz', 'Huelva', 'Ceuta']
  
  // Municipios por provincia - listas completas
  const municipiosByProvince: Record<string, string[]> = {
    'Cádiz': [
      'Alcalá de los Gazules', 'Alcalá del Valle', 'Algar', 'Algeciras', 'Algodonales', 'Arcos de la Frontera',
      'Barbate', 'Benalup-Casas Viejas', 'Benaocaz', 'Bornos', 'El Bosque', 'Cádiz', 'Castellar de la Frontera',
      'Chiclana de la Frontera', 'Chipiona', 'Conil de la Frontera', 'Espera', 'El Gastor', 'Grazalema',
      'Jerez de la Frontera', 'Jimena de la Frontera', 'La Línea de la Concepción', 'Los Barrios',
      'Medina-Sidonia', 'Olvera', 'Paterna de Rivera', 'Prado del Rey', 'El Puerto de Santa María',
      'Puerto Real', 'Puerto Serrano', 'Rota', 'San Fernando', 'San José del Valle', 'San Roque',
      'Sanlúcar de Barrameda', 'Setenil de las Bodegas', 'Tarifa', 'Torre Alháquime', 'Trebujena',
      'Ubrique', 'Vejer de la Frontera', 'Villaluenga del Rosario', 'Villamartín', 'Zahara'
    ],
    'Huelva': [
      'Alájar', 'Aljaraque', 'Almendro', 'Almonaster la Real', 'Almonte', 'Alosno', 'Aracena',
      'Aroche', 'Arroyomolinos de León', 'Ayamonte', 'Beas', 'Berrocal', 'Bollullos Par del Condado',
      'Bonares', 'Cabezas Rubias', 'Cala', 'Calañas', 'El Campillo', 'Campofrío', 'Cañaveral de León',
      'Cartaya', 'Castaño del Robledo', 'El Cerro de Andévalo', 'Chucena', 'Corteconcepción', 'Cortegana',
      'Cortelazor', 'Cumbres de Enmedio', 'Cumbres de San Bartolomé', 'Cumbres Mayores', 'Encinasola',
      'Escacena del Campo', 'Fuenteheridos', 'Galaroza', 'El Granado', 'La Granada de Río-Tinto',
      'Gibraleón', 'Higuera de la Sierra', 'Hinojales', 'Hinojos', 'Huelva', 'Isla Cristina',
      'Jabugo', 'Lepe', 'Linares de la Sierra', 'Lucena del Puerto', 'Manzanilla', 'Marines',
      'Minas de Riotinto', 'Moguer', 'La Nava', 'Nerva', 'Niebla', 'Palos de la Frontera',
      'La Palma del Condado', 'Paterna del Campo', 'Paymogo', 'Puebla de Guzmán', 'Puerto Moral',
      'Punta Umbría', 'Rociana del Condado', 'Rosal de la Frontera', 'San Bartolomé de la Torre',
      'San Juan del Puerto', 'San Silvestre de Guzmán', 'Sanlúcar de Guadiana', 'Santa Ana la Real',
      'Santa Bárbara de Casa', 'Santa Olalla del Cala', 'Trigueros', 'Valdelarco', 'Valverde del Camino',
      'Villablanca', 'Villalba del Alcor', 'Villanueva de las Cruces', 'Villanueva de los Castillejos',
      'Villarrasa', 'Zalamea la Real', 'Zufre'
    ],
    'Ceuta': [
      'Ceuta'
    ]
  }

  // 获取根据选择省份过滤的城市选项
  const getFilteredCities = () => {
    const allCities = new Set<string>()
    
    if (selectedProvince) {
      // 如果选择了省份，只显示该省份下的城市（不重複顯示省份名稱）
      const provinceCities = municipiosByProvince[selectedProvince] || []
      provinceCities.forEach(city => allCities.add(city))
    } else {
      // 如果没有选择省份，显示所有城市
      Object.values(municipiosByProvince).forEach(cities => {
        cities.forEach(city => allCities.add(city))
      })
    }
    
    return Array.from(allCities).sort()
  }

  // 获取可用城市（根据选择的省份过滤）
  const allCities = getFilteredCities()

  const filteredAndSortedCustomers = customers
    .filter(customer => {
      const matchesSearch = customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           customer.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           customer.email?.toLowerCase().includes(searchTerm.toLowerCase())
      
      // 省份筛选
      const matchesProvince = !selectedProvince || toCanonicalProvince(displayProvince(customer)) === toCanonicalProvince(selectedProvince)
      
      // 城市篩選 - 嚴格只匹配實際城市名稱
      const customerCity = displayCity(customer)
      const customerCityRaw = String(customer.city || '').trim()
      
      // 只匹配實際的城市，不管是否與省份同名
      const matchesCity = !selectedCity || 
                         customerCity.toLowerCase() === selectedCity.toLowerCase() ||
                         customerCityRaw.toLowerCase() === selectedCity.toLowerCase()
      
      
      return matchesSearch && matchesProvince && matchesCity
    })
    .sort((a, b) => {
      if (!sortField) return 0
      
      const aValue = (a[sortField] || '').toString().toLowerCase()
      const bValue = (b[sortField] || '').toString().toLowerCase()
      
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  
  // Municipios disponibles según provincia seleccionada (moved to modal scope)

  // 是否全選目前可見清單
  const allVisibleSelected = filteredAndSortedCustomers.length > 0 && filteredAndSortedCustomers.every(c => selectedIds.has(c.id))

  // 設定表頭核取方塊為不確定狀態
  useEffect(() => {
    if (!headerCheckboxRef.current) return
    const visibleIds = filteredAndSortedCustomers.map(c => c.id)
    const selectedVisible = visibleIds.filter(id => selectedIds.has(id)).length
    headerCheckboxRef.current.indeterminate = selectedVisible > 0 && selectedVisible < visibleIds.length
  }, [selectedIds, filteredAndSortedCustomers])

  const highlightedCount = highlightSinceDate
    ? customers.filter(isHighlighted).length
    : 0

  // 排序圖標組件
  const SortIcon = ({ field }: { field: keyof Customer }) => {
    if (sortField !== field) {
      return <span className="text-gray-400 ml-1">↕</span>
    }
    return (
      <span className="text-blue-600 ml-1">
        {sortDirection === 'asc' ? '↑' : '↓'}
      </span>
    )
  }

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
          {(selectedCity || selectedProvince || searchTerm) && (
            <div className="mt-2 text-sm text-blue-600 bg-blue-50 px-3 py-1 rounded-lg inline-block">
              {filteredAndSortedCustomers.length} clientes {selectedCity ? `en ${selectedCity}` : selectedProvince ? `en provincia ${selectedProvince}` : ''}
            </div>
          )}
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
            onClick={handleAddClick}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Cliente</span>
            <span className="sm:hidden">Agregar</span>
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

      {/* Banner: 資料歸屬警告 */}
      {unownedWarning && (
        <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-lg p-4">
          {unownedWarning}
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Filtros de Clientes</h2>
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="lg:flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Buscar</label>
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
            <div className="lg:w-48">
              <label className="block text-sm font-medium text-gray-700 mb-1">Provincia</label>
              <select
                value={selectedProvince}
                onChange={(e) => setSelectedProvince(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">{t.customers.allProvinces}</option>
                {provinces.map(province => (
                  <option key={province} value={province}>{province}</option>
                ))}
              </select>
            </div>
            <div className="lg:w-48">
              <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad</label>
              <select
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Todas las Ciudades</option>
                {selectedProvince ? (
                  (municipiosByProvince[selectedProvince] || []).map(city => (
                    <option key={city} value={city}>{city}</option>
                  ))
                ) : (
                  allCities.map(city => (
                    <option key={city} value={city}>{city}</option>
                  ))
                )}
              </select>
            </div>
            <div className="lg:w-32 flex items-end">
              <button
                onClick={() => {
                  setSearchTerm('')
                  setSelectedProvince('')
                  setSelectedCity('')
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                Limpiar Filtros
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Lista de clientes */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {filteredAndSortedCustomers.length === 0 ? (
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
              <thead>
              <tr className="bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Número</th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center gap-1">
                    Nombre
                    <SortIcon field="name" />
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('company')}
                >
                  <div className="flex items-center gap-1">
                    Empresa
                    <SortIcon field="company" />
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Teléfono</th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('email')}
                >
                  <div className="flex items-center gap-1">
                    Email
                    <SortIcon field="email" />
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dirección</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">C.P</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  CIUDAD
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Provincia</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contrato</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notas</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <input
                    ref={headerCheckboxRef}
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={selectAllVisible}
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredAndSortedCustomers.map((customer, index) => {
                  // 使用統一的顯示邏輯
                  const provincia = displayProvince(customer)
                  const municipio = displayCity(customer)
                  const contrato = (customer as any).contrato || ''
                  const cleanNotes = stripLocationTags(customer.notes as string)
                  const postalCode = (customer as any).postal_code || extractPostalCode(customer.address) || extractPostalCode(cleanNotes) || ''
                  const customerNum = ((customer as any).numero ?? (customer as any).num) || ''
                  
                  return (
                    <tr key={customer.id} className={`hover:bg-gray-50 ${isHighlighted(customer) ? 'bg-yellow-50' : ''}`}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {customerNum}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {customer.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {customer.company || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {customer.phone || customer.mobile_phone || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {customer.email || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {customer.address || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {postalCode || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {municipio || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {provincia || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{(customer as any).contrato || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{customer.notes || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(customer.id)}
                          onChange={() => toggleSelect(customer.id)}
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleEditOpen(customer)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteCustomer(customer.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white w-full max-w-2xl rounded-lg shadow-lg p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Editar cliente</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Nombre</label>
                <input
                  className="w-full px-3 py-2 border rounded"
                  value={editData.name}
                  onChange={e => handleEditChange('name', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Empresa</label>
                <input
                  className="w-full px-3 py-2 border rounded"
                  value={editData.company || ''}
                  onChange={e => handleEditChange('company', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Número</label>
                <input
                  className="w-full px-3 py-2 border rounded"
                  value={(editData as any).num || ''}
                  onChange={e => setEditData(prev => ({ ...prev, num: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Teléfono</label>
                <input
                  className="w-full px-3 py-2 border rounded"
                  value={editData.phone || ''}
                  onChange={e => handleEditChange('phone', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Email</label>
                <input
                  className="w-full px-3 py-2 border rounded"
                  value={editData.email || ''}
                  onChange={e => handleEditChange('email', e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm text-gray-700 mb-1">Dirección</label>
                <input
                  className="w-full px-3 py-2 border rounded"
                  value={editData.address || ''}
                  onChange={e => handleEditChange('address', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">C.P</label>
                <input
                  className="w-full px-3 py-2 border rounded"
                  value={(editData as any).postal_code || ''}
                  onChange={e => handleEditChange('postal_code' as any, e.target.value)}
                  placeholder="Código postal"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Provincia</label>
                <select
                  className="w-full px-3 py-2 border rounded"
                  value={editProvince}
                  onChange={e => handleProvinceChange(e.target.value)}
                >
                  <option value="">-</option>
                  {provinces.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Ciudad</label>
                <select
                  className="w-full px-3 py-2 border rounded"
                  value={editMunicipio}
                  onChange={e => handleMunicipioChange(e.target.value)}
                >
                  <option value="">-</option>
                  {editProvince && (
                    <>
                      {(municipiosByProvince[editProvince] || []).map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Contrato</label>
                <input
                  className="w-full px-3 py-2 border rounded"
                  value={(editData as any).contrato || ''}
                  onChange={e => handleEditChange('contrato' as any, e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm text-gray-700 mb-1">Notas</label>
                <textarea
                  className="w-full px-3 py-2 border rounded"
                  rows={3}
                  value={(editData as any).notes || ''}
                  onChange={e => handleEditChange('notes' as any, e.target.value)}
                />
              </div>
              <div className="sm:col-span-2 mt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleEditClose}
                  className="px-4 py-2 border rounded hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleEditSave}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Customer Modal */}
      {showAddModal && (
        <AddCustomerModal
          onClose={() => setShowAddModal(false)}
          onSave={(newCustomer) => {
            setCustomers([newCustomer, ...customers])
            setShowAddModal(false)
          }}
        />
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-md">
            <h3 className="text-lg font-semibold mb-4">Confirmar eliminación</h3>
            <p className="text-gray-600 mb-6">
              ¿Estás seguro de que quieres eliminar {selectedIds.size} cliente(s)? Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowBulkConfirm(false)}
                className="px-4 py-2 border rounded hover:bg-gray-50"
                disabled={bulkDeleting}
              >
                Cancelar
              </button>
              <button
                onClick={doBulkDelete}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-60"
                disabled={bulkDeleting}
              >
                {bulkDeleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Add Customer Modal Component
function AddCustomerModal({ onClose, onSave }: { onClose: () => void, onSave: (customer: Customer) => void }) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    phone: '',
    email: '',
    address: '',
    cp: '',
    city: '',
    contrato: '',
    notes: '',
    numero: ''
  })
  const [addProvince, setAddProvince] = useState<string>('')
  const [addMunicipio, setAddMunicipio] = useState<string>('')
  const t = translations

  // Provincias disponibles
  const provinces = ['Cádiz', 'Huelva', 'Ceuta']
  
  // Municipios por provincia
  const municipiosByProvince: Record<string, string[]> = {
    'Cádiz': [
      'Alcalá de los Gazules', 'Alcalá del Valle', 'Algar', 'Algeciras', 'Algodonales', 'Arcos de la Frontera',
      'Barbate', 'Benalup-Casas Viejas', 'Benaocaz', 'Bornos', 'El Bosque', 'Cádiz', 'Castellar de la Frontera',
      'Chiclana de la Frontera', 'Chipiona', 'Conil de la Frontera', 'Espera', 'El Gastor', 'Grazalema',
      'Jerez de la Frontera', 'Jimena de la Frontera', 'La Línea de la Concepción', 'Los Barrios',
      'Medina-Sidonia', 'Olvera', 'Paterna de Rivera', 'Prado del Rey', 'El Puerto de Santa María',
      'Puerto Real', 'Puerto Serrano', 'Rota', 'San Fernando', 'San José del Valle', 'San Roque',
      'Sanlúcar de Barrameda', 'Setenil de las Bodegas', 'Tarifa', 'Torre Alháquime', 'Trebujena',
      'Ubrique', 'Vejer de la Frontera', 'Villaluenga del Rosario', 'Villamartín', 'Zahara'
    ],
    'Huelva': [
      'Alájar', 'Aljaraque', 'Almendro', 'Almonaster la Real', 'Almonte', 'Alosno', 'Aracena',
      'Aroche', 'Arroyomolinos de León', 'Ayamonte', 'Beas', 'Berrocal', 'Bollullos Par del Condado',
      'Bonares', 'Cabezas Rubias', 'Cala', 'Calañas', 'El Campillo', 'Campofrío', 'Cañaveral de León',
      'Cartaya', 'Castaño del Robledo', 'El Cerro de Andévalo', 'Chucena', 'Corteconcepción', 'Cortegana',
      'Cortelazor', 'Cumbres de Enmedio', 'Cumbres de San Bartolomé', 'Cumbres Mayores', 'Encinasola',
      'Escacena del Campo', 'Fuenteheridos', 'Galaroza', 'El Granado', 'La Granada de Río-Tinto',
      'Gibraleón', 'Higuera de la Sierra', 'Hinojales', 'Hinojos', 'Huelva', 'Isla Cristina',
      'Jabugo', 'Lepe', 'Linares de la Sierra', 'Lucena del Puerto', 'Manzanilla', 'Marines',
      'Minas de Riotinto', 'Moguer', 'La Nava', 'Nerva', 'Niebla', 'Palos de la Frontera',
      'La Palma del Condado', 'Paterna del Campo', 'Paymogo', 'Puebla de Guzmán', 'Puerto Moral',
      'Punta Umbría', 'Rociana del Condado', 'Rosal de la Frontera', 'San Bartolomé de la Torre',
      'San Juan del Puerto', 'San Silvestre de Guzmán', 'Sanlúcar de Guadiana', 'Santa Ana la Real',
      'Santa Bárbara de Casa', 'Santa Olalla del Cala', 'Trigueros', 'Valdelarco', 'Valverde del Camino',
      'Villablanca', 'Villalba del Alcor', 'Villanueva de las Cruces', 'Villanueva de los Castillejos',
      'Villarrasa', 'Zalamea la Real', 'Zufre'
    ],
    'Ceuta': [
      'Ceuta'
    ]
  }
  
  // Municipios disponibles según provincia seleccionada
  const availableMunicipios = addProvince ? (municipiosByProvince[addProvince] || []) : []

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleProvinceChange = (prov: string) => {
    setAddProvince(prov)
    // Ajustar city: si es Cádiz/Huelva/Ceuta, city = provincia; sino mantener municipio
    if (prov === 'Cádiz' || prov === 'Huelva' || prov === 'Ceuta') {
      setFormData(prev => ({ ...prev, city: prov }))
    } else {
      setFormData(prev => ({ ...prev, city: addMunicipio }))
    }
  }

  const handleMunicipioChange = (muni: string) => {
    setAddMunicipio(muni)
    // Si provincia es Cádiz/Huelva/Ceuta, mantener city=provincia; sino city=municipio
    const cityValue = (addProvince === 'Cádiz' || addProvince === 'Huelva' || addProvince === 'Ceuta') ? addProvince : muni
    setFormData(prev => ({ ...prev, city: cityValue }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user?.id) return
    if (!formData.name.trim()) return

    setLoading(true)
    try {
      // 不再將 省/市 資訊自動寫入 notes，僅保留用戶輸入
      const finalNotes = formData.notes || ''

      const payload = {
        name: formData.name,
        company: formData.company || null,
        phone: formData.phone || null,
        email: formData.email || null,
        address: formData.address || null,
        // send cp; backend maps to postal_code
        ...(formData.cp ? { cp: (formData.cp || '').trim() } : {}),
        city: addMunicipio || addProvince || null,
        province: addProvince || null,
        contrato: formData.contrato || null,
        notes: finalNotes || null,
        created_by: user.id,
        // send as num; backend will dual-write to num/numero
        num: formData.numero || null
      }

      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      })

      const result = await response.json()
      
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to create customer')
      }

      if (result.data) onSave(result.data as Customer)
    } catch (err) {
      console.error('Error creating customer:', err)
      alert(t.customers?.createError || 'Error creando cliente')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white w-full max-w-xl rounded-lg shadow-lg max-h-[90vh] overflow-y-auto overscroll-contain">
        <div className="sticky top-0 z-10 bg-white border-b px-6 py-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Agregar cliente</h3>
          <button onClick={onClose} className="p-2 rounded hover:bg-gray-100" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm text-gray-700 mb-1">Nombre</label>
            <input
              className="w-full px-3 py-2 border rounded"
              value={formData.name}
              onChange={e => handleChange('name', e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Empresa</label>
            <input
              className="w-full px-3 py-2 border rounded"
              value={formData.company}
              onChange={e => handleChange('company', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Número</label>
            <input
              className="w-full px-3 py-2 border rounded"
              value={formData.numero}
              onChange={e => handleChange('numero', e.target.value)}
              placeholder="Ingrese número del cliente"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Teléfono</label>
            <input
              className="w-full px-3 py-2 border rounded"
              value={formData.phone}
              onChange={e => handleChange('phone', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Email</label>
            <input
              className="w-full px-3 py-2 border rounded"
              value={formData.email}
              onChange={e => handleChange('email', e.target.value)}
              type="email"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">C.P</label>
            <input
              className="w-full px-3 py-2 border rounded"
              value={(formData as any).cp || ''}
              onChange={e => handleChange('cp', e.target.value)}
              placeholder="Código postal"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm text-gray-700 mb-1">Dirección</label>
            <input
              className="w-full px-3 py-2 border rounded"
              value={formData.address}
              onChange={e => handleChange('address', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Provincia</label>
            <select
              className="w-full px-3 py-2 border rounded"
              value={addProvince}
              onChange={e => handleProvinceChange(e.target.value)}
            >
              <option value="">-</option>
              {provinces.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Ciudad</label>
            <select
              className="w-full px-3 py-2 border rounded"
              value={addMunicipio}
              onChange={e => handleMunicipioChange(e.target.value)}
            >
              <option value="">-</option>
              {addProvince && (
                <>
                  {(availableMunicipios || []).map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </>
              )}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Contrato</label>
            <input
              className="w-full px-3 py-2 border rounded"
              value={(formData as any).contrato}
              onChange={e => handleChange('contrato', e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm text-gray-700 mb-1">Notas</label>
            <textarea
              className="w-full px-3 py-2 border rounded"
              rows={3}
              value={formData.notes}
              onChange={e => handleChange('notes', e.target.value)}
            />
          </div>
          <div className="sticky bottom-0 bg-white border-t p-4 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded" disabled={loading}>Cancelar</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60" disabled={loading || !formData.name.trim()}>
              {loading ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}