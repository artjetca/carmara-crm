import React, { useState, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { translations } from '../lib/translations'
import {
  Upload,
  FileText,
  Download,
  CheckCircle,
  XCircle,
  AlertCircle,
  Users,
  FileSpreadsheet,
  Eye,
  Trash2
} from 'lucide-react'
import { useStore } from '../store/useStore'
import * as XLSX from 'xlsx'

interface ImportResult {
  success: number
  errors: number
  skipped: number
  total: number
  errorDetails: Array<{
    row: number
    error: string
    data: any
    type: 'error' | 'skipped'
  }>
}

interface CustomerData {
  num?: string
  name: string
  company?: string
  phone?: string
  email?: string
  address?: string
  postal_code?: string
  city?: string
  provincia?: string
  contrato?: string
  notes?: string
}

export default function DataImport() {
  const { user } = useAuth()
  const { setCurrentPage, setImportHighlightSince } = useStore()
  const [dragActive, setDragActive] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [previewData, setPreviewData] = useState<CustomerData[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingClo, setDeletingClo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const t = translations

  // 规范化城市，仅允许 Cádiz 和 Huelva，兼容大小写与重音
  const normalizeCity = (input?: string): string | null => {
    if (!input) return null
    const v = input
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // 去除重音
    if (v === 'cadiz') return 'Cádiz'
    if (v === 'huelva') return 'Huelva'
    return null
  }

  // 规范化省份，与后端逻辑保持一致
  const toCanonicalProvince = (input?: string): string | null => {
    if (!input) return null
    const v = input
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // 去除重音
    if (v === 'cadiz') return 'Cádiz'
    if (v === 'huelva') return 'Huelva'
    return null
  }

  // 清洗并验证西班牙电话，仅允许以6/7/8/9开头的9位数字
  const sanitizePhone = (input?: string): string | null => {
    if (!input) return null
    const digits = input.replace(/\D/g, '')
    return /^[6789]\d{8}$/.test(digits) ? digits : null
  }
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    const files = e.dataTransfer.files
    if (files && files[0]) {
      handleFileSelect(files[0])
    }
  }

  const handleFileSelect = (selectedFile: File) => {
    // 使用副檔名比對，避免某些瀏覽器對 xlsx 類型回傳空字串
    const ext = selectedFile.name.split('.').pop()?.toLowerCase()
    const validExts = ['csv', 'xlsx', 'xls']
    if (!ext || !validExts.includes(ext)) {
      alert(t.dataImport.invalidFileType)
      return
    }

    setFile(selectedFile)
    setImportResult(null)
    setPreviewData([])
    setShowPreview(false)
  }

  // Función para formatear números de teléfono
  const formatPhoneNumber = (phone: string): string => {
    if (!phone) return ''
    
    // Remover todos los espacios, guiones y caracteres especiales
    let cleaned = phone.replace(/[\s\-\(\)\+]/g, '')
    
    // Si empieza con 34 (código de España), removerlo
    if (cleaned.startsWith('34')) {
      cleaned = cleaned.substring(2)
    }
    
    // Validar que tenga al menos 9 dígitos para cumplir con la restricción de la BD
    if (cleaned.length >= 9) {
      // Si es exactamente 9 dígitos, usar tal como está
      if (cleaned.length === 9) {
        return cleaned
      }
      // Si es más largo, tomar los útimos 9 dígitos
      return cleaned.slice(-9)
    }
    
    // Si tiene menos de 9 dígitos, devolver vacío para evitar errores de restricción
    return ''
  }

  // Función para formatear números de móvil (específico para España)
  const formatMobileNumber = (phone: string): string => {
    if (!phone) return ''
    
    // Remover todos los espacios, guiones y caracteres especiales
    let cleaned = phone.replace(/[\s\-\(\)\+]/g, '')
    
    // Si empieza con 34 (código de España), removerlo
    if (cleaned.startsWith('34')) {
      cleaned = cleaned.substring(2)
    }
    
    // Validar formato de móvil español: debe empezar con 6, 7, 8 o 9 y tener 9 dígitos
    if (cleaned.length === 9 && /^[6789]/.test(cleaned)) {
      return cleaned
    }
    
    // Si no cumple el formato, devolver vacío
    return ''
  }

  // 将表头统一为无重音的小写并移除分隔符，便于匹配
  // 例如 "teléfono" -> "telefono"，"dirección" -> "direccion"，"C.P"/"C P" -> "cp"
  const normalizeHeader = (h: string) =>
    h
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // 去除重音
      .replace(/[\.\s_\-]/g, '') // 去除点/空格/下划线/连字符

  // 侦测分隔符：优先使用分号;，否则用逗号,
  const detectDelimiter = (line: string): ',' | ';' => {
    const comma = (line.match(/,/g) || []).length
    const semi = (line.match(/;/g) || []).length
    return semi > comma ? ';' : ','
  }

  // 安全拆分一行 CSV，支持引号包裹与转义双引号
  const splitCSVLine = (line: string, delimiter: ',' | ';'): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // 转义的双引号 => 追加一个双引号并跳过下一个字符
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(current)
        current = ''
      } else {
        current += char
      }
    }
    result.push(current)
    return result
  }

  // 解析 CSV 文本：容错分隔符（, 或 ;），容错引号与重音表头
  const parseCSV = (text: string): CustomerData[] => {
    // 标准化换行
    const rows = text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .filter(line => line.trim().length > 0)

    if (rows.length < 2) return []

    const delimiter = detectDelimiter(rows[0])

    const rawHeaders = splitCSVLine(rows[0], delimiter).map(h => h.trim())
    const headers = rawHeaders.map(normalizeHeader)

    const data: CustomerData[] = []

    for (let i = 1; i < rows.length; i++) {
      const values = splitCSVLine(rows[i], delimiter).map(v => v.trim())
      const customer: CustomerData = {
        name: '',
        company: '',
        phone: '',
        email: '',
        address: '',
        city: '',
        provincia: '',
        contrato: '',
        notes: ''
      }

      headers.forEach((header, index) => {
        const value = values[index] || ''
        // 使用无重音的小写表头进行匹配
        if (header.includes('num') || header === 'num') {
          customer.num = value
        } else if (header.includes('nombre') || header.includes('name')) {
          customer.name = value
        } else if (header.includes('empresa') || header.includes('company')) {
          customer.company = value
        } else if (header.includes('telefono') || header.includes('phone') || header.includes('movil') || header.includes('mobile')) {
          // 先尝试识别为手机号（6/7/8/9开头的9位），否则保留常规电话格式化
          const mobileFormatted = formatMobileNumber(value)
          if (mobileFormatted) {
            customer.phone = mobileFormatted
          } else {
            customer.phone = formatPhoneNumber(value)
          }
        } else if (header.includes('email') || header.includes('correo')) {
          customer.email = value
        } else if (header.includes('direccion') || header.includes('address')) {
          customer.address = value
        } else if (header.includes('cp') || header.includes('postal') || header === 'cp') {
          customer.postal_code = value
        } else if (header.includes('ciudad') || header.includes('city')) {
          customer.city = value
        } else if (header.includes('provincia') || header.includes('province') || header.includes('state')) {
          customer.provincia = value
        } else if (header.includes('contrato') || header.includes('contract')) {
          customer.contrato = value
        } else if (header.includes('notas') || header.includes('notes')) {
          customer.notes = value
        }
      })

      if (customer.name) {
        data.push(customer)
      }
    }

    return data
  }

  // 解析 Excel 檔案（.xlsx/.xls）
  const parseExcel = async (file: File): Promise<CustomerData[]> => {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const sheetName = wb.SheetNames[0]
    const sheet = wb.Sheets[sheetName]
    // 以 header:1 取得第一列作為原始表頭
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }) as any[]
    if (!rows || rows.length < 2) return []
    // 將第一列當作表頭，其他列為資料
    const rawHeaders: string[] = (rows[0] as any[]).map(v => String(v || '').trim())
    const headers = rawHeaders.map(normalizeHeader)
    const dataRows = rows.slice(1)

    const data: CustomerData[] = []
    for (const r of dataRows) {
      const values = (r as any[]).map(v => String(v || '').trim())
      const customer: CustomerData = {
        name: '',
        company: '',
        phone: '',
        email: '',
        address: '',
        city: '',
        provincia: '',
        contrato: '',
        notes: ''
      }
      headers.forEach((header, index) => {
        const value = values[index] || ''
        if (header.includes('num') || header === 'num') {
          customer.num = value
        } else if (header.includes('nombre') || header.includes('name')) {
          customer.name = value
        } else if (header.includes('empresa') || header.includes('company')) {
          customer.company = value
        } else if (header.includes('telefono') || header.includes('phone') || header.includes('movil') || header.includes('mobile')) {
          const mobileFormatted = formatMobileNumber(value)
          customer.phone = mobileFormatted || formatPhoneNumber(value)
        } else if (header.includes('email') || header.includes('correo')) {
          customer.email = value
        } else if (header.includes('direccion') || header.includes('address')) {
          customer.address = value
        } else if (header.includes('cp') || header.includes('postal') || header === 'cp') {
          customer.postal_code = value
        } else if (header.includes('ciudad') || header.includes('city')) {
          customer.city = value
        } else if (header.includes('provincia') || header.includes('province') || header.includes('state')) {
          customer.provincia = value
        } else if (header.includes('contrato') || header.includes('contract')) {
          customer.contrato = value
        } else if (header.includes('notas') || header.includes('notes')) {
          customer.notes = value
        }
      })
      if (customer.name) data.push(customer)
    }
    return data
  }

  // 根据檔案自動選擇解析器
  const parseFile = async (f: File): Promise<CustomerData[]> => {
    const ext = f.name.split('.').pop()?.toLowerCase()
    if (ext === 'xlsx' || ext === 'xls') {
      return parseExcel(f)
    }
    // 預設視為 CSV
    const text = await f.text()
    return parseCSV(text)
  }

  const previewFile = async () => {
    if (!file) return

    try {
      const data = await parseFile(file)
      setPreviewData(data.slice(0, 10))
      setShowPreview(true)
    } catch (error) {
      console.error('Error previewing file:', error)
      alert(t.dataImport.previewError)
    }
  }

  // 新增：确保当前用户在 perfiles 表中存在，以通过 customers.created_by 外键校验
  const ensureUserProfile = async () => {
    if (!user) return
    const payload = {
      id: user.id,
      email: user.email || '',
      full_name: (user as any)?.user_metadata?.full_name || ''
    }
    // 优先尝试 user_profiles（根据当前迁移文件）
    const { error: upsertUserProfilesError } = await supabase
      .from('user_profiles')
      .upsert(payload, { onConflict: 'id' })

    // 如果不存在该表或有错误，则回退到 profiles（兼容另一种命名）
    if (upsertUserProfilesError) {
      await supabase.from('profiles').upsert(payload, { onConflict: 'id' })
    }
  }

  // 检查客戶是否已存在，根据 email 或 name+company 組合
  const checkExistingCustomer = async (customerData: CustomerData) => {
    if (!user) return null
    
    // 優先使用 email 檢查（如果有的話）
    if (customerData.email && customerData.email.trim()) {
      const { data: existingByEmail } = await supabase
        .from('customers')
        .select('id, name, company, email')
        .eq('created_by', user.id)
        .eq('email', customerData.email.trim())
        .limit(1)
      
      if (existingByEmail && existingByEmail.length > 0) {
        return existingByEmail[0]
      }
    }
    
    // 備選：使用 name + company 組合檢查
    if (customerData.name && customerData.name.trim()) {
      const { data: existingByName } = await supabase
        .from('customers')
        .select('id, name, company, email')
        .eq('created_by', user.id)
        .eq('name', customerData.name.trim())
        .eq('company', customerData.company?.trim() || null)
        .limit(1)
      
      if (existingByName && existingByName.length > 0) {
        return existingByName[0]
      }
    }
    
    return null
  }

  // 基於省份和筆記自動填充城市
  const autoFillCityFromProvinceAndNotes = (customerData: CustomerData): string | null => {
    // 如果已經有城市，不覆蓋
    if (customerData.city && normalizeCity(customerData.city)) {
      return normalizeCity(customerData.city)
    }
    
    const province = customerData.provincia ? toCanonicalProvince(customerData.provincia) : null
    const notes = customerData.notes ? customerData.notes.toLowerCase() : ''
    
    // 根據省份自動填充城市
    if (province === 'Huelva') {
      // 檢查筆記中是否包含 Cádiz 相關信息
      if (notes.includes('cadiz') || notes.includes('cádiz')) {
        return 'Cádiz'
      }
      return 'Huelva'
    }
    
    if (province === 'Cádiz') {
      // 檢查筆記中是否包含 Huelva 相關信息
      if (notes.includes('huelva')) {
        return 'Huelva'
      }
      return 'Cádiz'
    }
    
    // 如果省份不是 Huelva 或 Cádiz，檢查筆記中的城市線索
    if (notes.includes('huelva')) {
      return 'Huelva'
    }
    if (notes.includes('cadiz') || notes.includes('cádiz')) {
      return 'Cádiz'
    }
    
    return null
  }

  const importData = async () => {
    if (!file || !user) {
      console.log('Import aborted: file or user missing', { file: !!file, user: !!user })
      return
    }
    
    console.log('Starting import process...')
    setImporting(true)
    
    try {
      // 记录导入起始时间用于高亮客户
      const importStartIso = new Date().toISOString()

      // 确保外键所需的用户档案存在
      await ensureUserProfile()

      // 使用與預覽相同的解析器，支援 CSV 與 XLSX
      console.log('Parsing file...')
      const data = await parseFile(file)
      console.log('Parsed data:', data.length, 'records')
      
      const result: ImportResult = {
        success: 0,
        errors: 0,
        skipped: 0,
        total: data.length,
        errorDetails: []
      }
      
      for (let i = 0; i < data.length; i++) {
        const customer = data[i]
        
        try {
          // 檢查是否為重複客戶
          const existingCustomer = await checkExistingCustomer(customer)
          if (existingCustomer) {
            console.log(`Skipping duplicate customer: ${customer.name} (${customer.email || 'no email'})`, existingCustomer)
            result.errorDetails.push({
              row: i + 2,
              error: `✓ Cliente ya existe en el sistema: "${existingCustomer.name}" ${existingCustomer.company ? `- ${existingCustomer.company}` : ''} ${existingCustomer.email ? `(${existingCustomer.email})` : ''} - Se omite importación`,
              data: customer,
              type: 'skipped'
            })
            result.skipped++
            continue
          }
          // 准备 notes：只保存原始 notes 和无法映射到专用列的信息
          const notesToSave: string[] = []
          if (customer.notes) notesToSave.push(customer.notes)
          
          // 只有无法标准化的城市才保存到 notes
          if (customer.city && !normalizeCity(customer.city)) {
            notesToSave.push(`Ciudad: ${customer.city}`)
          }
          
          // 处理 province 字段 - 现在数据库有专用列
          const normalizedProvince = customer.provincia ? toCanonicalProvince(customer.provincia) : null
          
          // 只有无法标准化的省份才保存到 notes
          if (customer.provincia && !normalizedProvince) {
            notesToSave.push(`Provincia: ${customer.provincia}`)
          }

          // 自動填充城市基於省份和筆記
          const autoFilledCity = autoFillCityFromProvinceAndNotes(customer)
          const finalCity = autoFilledCity || customer.city

          const finalNotes = notesToSave.join(' | ')

          // 使用 API 端点而不是直接 Supabase 调用，确保后端标准化逻辑生效
          const payload: any = {
            name: customer.name,
            company: customer.company || null,
            phone: customer.phone || null, // 让后端处理电话号码清理
            email: customer.email || null,
            address: customer.address || null,
            postal_code: customer.postal_code || null,
            city: finalCity || null, // 使用自動填充的城市或原始城市
            province: normalizedProvince,
            contrato: customer.contrato || null,
            notes: finalNotes || null,
            created_by: user?.id || null,
            num: customer.num || null
          }

          // 使用 API 端点插入，确保后端标准化和双写逻辑
          const response = await fetch('/api/customers', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
          })

          let error = null
          let insertData = null
          
          if (!response.ok) {
            const result = await response.json()
            error = { message: result.error || `HTTP ${response.status}` }
          } else {
            const result = await response.json()
            if (result.success) {
              insertData = result.data
            } else {
              error = { message: result.error || 'API call failed' }
            }
          }

          // API 端点已经处理了所有重试逻辑，无需额外处理

          if (error) {
            console.error('Insert error:', error)
            throw error
          }

          console.log('Insert successful:', insertData)
          result.success++
          console.log(`Row ${i + 1} imported successfully`)
        } catch (error: any) {
          result.errors++
          console.log(`Row ${i + 1} failed:`, error.message)
          result.errorDetails.push({
            row: i + 2,
            error: error.message,
            data: customer,
            type: 'error'
          })
        }
      }
      
      console.log('Import completed, setting result:', result)
      setImportResult(result)
      // 设置高亮时间点，供客户列表页着色
      setImportHighlightSince(importStartIso)
    } catch (error) {
      console.error('Error importing data:', error)
      alert(t.dataImport.importError)
    } finally {
      console.log('Import process finished, setting importing to false')
      setImporting(false)
    }
  }

  const downloadTemplate = () => {
    const csvContent = [
      'num,nombre,empresa,teléfono,email,dirección,C.P,ciudad,provincia,contrato,notas',
      'A1,Juan Pérez,Empresa ABC,600123456,juan@empresa.com,Calle Mayor 123,11001,Cádiz,Cádiz,Activo,Cliente potencial',
      'A2,María García,Empresa XYZ,700789012,maria@empresa.com,Avenida Principal 456,21001,Huelva,Huelva,Pendiente,Cliente VIP'
    ].join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', 'plantilla_clientes.csv')
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const clearFile = () => {
    setFile(null)
    setImportResult(null)
    setPreviewData([])
    setShowPreview(false)
    setImporting(false) // Reset importing state
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const deleteAllImportedData = async () => {
    if (!user) return
    
    setDeleting(true)
    
    try {
      // Eliminar todos los clientes creados por este usuario
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('created_by', user.id)
      
      if (error) throw error
      
      // Limpiar el estado de la página
      setImportResult(null)
      setFile(null)
      setPreviewData([])
      setShowPreview(false)
      setShowDeleteConfirm(false)
      
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      
      alert(t.dataImport.deleteSuccess)
    } catch (error: any) {
      console.error('Error deleting data:', error)
      alert(t.dataImport.deleteError)
    } finally {
      setDeleting(false)
    }
  }

  // Delete only customers whose notes contain 'clo5220'
  const deleteCustomersWithClo5220 = async () => {
    if (!user) return

    const confirmed = window.confirm(
      '¿Estás seguro de que quieres eliminar todos los clientes cuyo campo "Notas" contiene "clo5220"? Esta acción no se puede deshacer.'
    )
    if (!confirmed) return

    setDeletingClo(true)
    try {
      // Delete scoped to the current user to avoid affecting otros usuarios
      const { data: deletedRows, error } = await supabase
        .from('customers')
        .delete()
        .ilike('notes', '%clo5220%')
        .eq('created_by', user.id)
        .select('id')

      if (error) throw error

      const count = deletedRows?.length || 0
      alert(count > 0
        ? `Se eliminaron ${count} registro(s) con "clo5220" en Notas`
        : 'No se encontraron registros con "clo5220" en Notas para eliminar')
    } catch (error) {
      console.error('Error deleting clo5220 records:', error)
      alert('Error al eliminar registros con "clo5220" en Notas')
    } finally {
      setDeletingClo(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t.dataImport.title}</h1>
          <p className="text-gray-600">{t.dataImport.subtitle}</p>
        </div>
        <button
          onClick={downloadTemplate}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          <Download className="w-4 h-4" />
          <span>{t.dataImport.downloadTemplate}</span>
        </button>
      </div>

      {/* Instrucciones */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <div className="flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-blue-900 mb-2">{t.dataImport.instructions}</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• {t.dataImport.instruction1}</li>
              <li>• {t.dataImport.instruction2}</li>
              <li>• {t.dataImport.instruction3}</li>
              <li>• {t.dataImport.instruction4}</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Área de carga */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6">
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
              dragActive
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => e.target.files && handleFileSelect(e.target.files[0])}
              className="hidden"
            />
            
            {file ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center space-x-3">
                  <FileSpreadsheet className="w-12 h-12 text-green-500" />
                  <div className="text-left">
                    <p className="text-lg font-medium text-gray-900">{file.name}</p>
                    <p className="text-sm text-gray-500">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center justify-center space-x-3">
                  <button
                    onClick={previewFile}
                    className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <Eye className="w-4 h-4" />
                    <span>{t.dataImport.preview}</span>
                  </button>
                  
                  <button
                    onClick={() => {
                      console.log('Import button clicked!')
                      console.log('Button state:', { importing, file: !!file, user: !!user })
                      try {
                        importData()
                      } catch (error) {
                        console.error('Error calling importData:', error)
                      }
                    }}
                    disabled={importing}
                    className="inline-flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    <Upload className="w-4 h-4" />
                    <span>{importing ? t.dataImport.importing : t.dataImport.import}</span>
                  </button>
                  
                  <button
                    onClick={clearFile}
                    className="inline-flex items-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{t.common.clear}</span>
                  </button>
                  
                  <button
                    onClick={() => {
                      console.log('Reset button clicked')
                      setImporting(false)
                      setImportResult(null)
                    }}
                    className="inline-flex items-center space-x-2 px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50"
                  >
                    <span>Reset</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <Upload className="w-12 h-12 text-gray-400 mx-auto" />
                <div>
                  <p className="text-lg font-medium text-gray-900 mb-2">
                    {t.dataImport.dropFile}
                  </p>
                  <p className="text-sm text-gray-500 mb-4">
                    {t.dataImport.supportedFormats}
                  </p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <FileText className="w-4 h-4" />
                    <span>{t.dataImport.selectFile}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Vista previa */}
      {showPreview && previewData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              {t.dataImport.previewTitle} ({previewData.length} {t.dataImport.records})
            </h3>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Num
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Nombre
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Empresa
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Teléfono
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Dirección
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      C.P
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ciudad
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Provincia
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contrato
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Notas
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {previewData.map((customer, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {customer.num}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {customer.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {customer.company}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {customer.phone}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {customer.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {customer.address}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {customer.postal_code}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {customer.city}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {customer.provincia}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {customer.contrato}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {customer.notes}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Resultados de importación */}
      {importResult && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              {t.dataImport.importResults}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center space-x-3">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                  <div>
                    <p className="text-2xl font-bold text-green-900">{importResult.success}</p>
                    <p className="text-sm text-green-700">Importados</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-center space-x-3">
                  <AlertCircle className="w-8 h-8 text-yellow-500" />
                  <div>
                    <p className="text-2xl font-bold text-yellow-900">{importResult.skipped || 0}</p>
                    <p className="text-sm text-yellow-700">Ya existían</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center space-x-3">
                  <XCircle className="w-8 h-8 text-red-500" />
                  <div>
                    <p className="text-2xl font-bold text-red-900">{importResult.errors}</p>
                    <p className="text-sm text-red-700">Errores</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center space-x-3">
                  <Users className="w-8 h-8 text-blue-500" />
                  <div>
                    <p className="text-2xl font-bold text-blue-900">{importResult.total}</p>
                    <p className="text-sm text-blue-700">Total procesados</p>
                  </div>
                </div>
              </div>
            </div>

            {/* CTA: 前往客戶列表並高亮本次導入 */}
            <div className="mb-6">
              <button
                onClick={() => setCurrentPage('customers')}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Users className="w-4 h-4" />
                <span>Ir a la lista de clientes</span>
              </button>
            </div>
            
            {importResult.errorDetails.length > 0 && (
              <div className="space-y-4">
                {/* Clientes que ya existían */}
                {importResult.errorDetails.filter(e => e.type === 'skipped').length > 0 && (
                  <div>
                    <h4 className="text-md font-medium text-gray-900 mb-3 flex items-center">
                      <AlertCircle className="w-5 h-5 text-yellow-500 mr-2" />
                      Clientes que ya existían en el sistema ({importResult.errorDetails.filter(e => e.type === 'skipped').length})
                    </h4>
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 max-h-64 overflow-y-auto">
                      <div className="space-y-2">
                        {importResult.errorDetails.filter(e => e.type === 'skipped').map((error, index) => (
                          <div key={index} className="text-sm">
                            <span className="font-medium text-yellow-900">
                              Fila {error.row}:
                            </span>
                            <span className="text-yellow-800 ml-2">{error.error}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Errores reales */}
                {importResult.errorDetails.filter(e => e.type === 'error').length > 0 && (
                  <div>
                    <h4 className="text-md font-medium text-gray-900 mb-3 flex items-center">
                      <XCircle className="w-5 h-5 text-red-500 mr-2" />
                      Errores de importación ({importResult.errorDetails.filter(e => e.type === 'error').length})
                    </h4>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-h-64 overflow-y-auto">
                      <div className="space-y-2">
                        {importResult.errorDetails.filter(e => e.type === 'error').map((error, index) => (
                          <div key={index} className="text-sm">
                            <span className="font-medium text-red-900">
                              Fila {error.row}:
                            </span>
                            <span className="text-red-700 ml-2">{error.error}</span>
                            <div className="text-red-600 ml-4 text-xs">
                              {error.data.name} - {error.data.company}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Botón para eliminar datos importados */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-md font-medium text-gray-900">
                    Acciones de Limpieza
                  </h4>
                  <p className="text-sm text-gray-500">
                    Eliminar todos los datos importados previamente
                  </p>
                </div>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={deleting}
                  className="inline-flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{deleting ? 'Eliminando...' : 'Limpiar Datos Importados'}</span>
                </button>
                <button
                  onClick={deleteCustomersWithClo5220}
                  disabled={deletingClo}
                  className="inline-flex items-center space-x-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{deletingClo ? 'Eliminando...' : 'Eliminar "clo5220" en Notas'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal de confirmación para eliminar */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center space-x-3 mb-4">
              <div className="flex-shrink-0">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900">
                  Confirmar Eliminación
                </h3>
              </div>
            </div>
            
            <p className="text-sm text-gray-500 mb-6">
              ¿Estás seguro de que quieres eliminar todos los datos importados? Esta acción no se puede deshacer.
            </p>
            
            <div className="flex space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={deleteAllImportedData}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}