import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, X, Check, Trash2, Play, Pause, RotateCcw, ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import { fetchProspectAutoCaptureConfig } from '../../services/prospectScrapeService'
import {
  buildProspectAutoCaptureQuery,
  getCitiesForProvince,
  PROSPECT_PROVINCES,
  KEYWORD_PRESETS,
  KEYWORD_PRESET_GROUPS,
  type KeywordPreset,
  type KeywordPresetGroup,
} from './prospectLocationOptions'
import { getProspectModalButtonClass } from './prospectActionButtonStyles'

export type AutoCaptureFormData = {
  province: string
  city: string
  manualKeywordInput: string
  selectedKeywords: KeywordPreset[]
  selectedPresetGroup: string | null
  limit: number
  mode: 'single' | 'batch'
}

export type CaptureProgress = {
  isRunning: boolean
  currentKeywordIndex: number
  totalKeywords: number
  currentKeyword: string
  processedCount: number
  totalCount: number
  addedCount: number
  skippedCount: number
  errorCount: number
}

type ProspectAutoCaptureModalProps = {
  onClose: () => void
  onSubmit: (payload: {
    province: string
    city?: string
    keyword: string
    keywords?: string[]
    limit: number
    mode: 'single' | 'batch'
  }) => Promise<void>
  initialProgress?: CaptureProgress
}

export default function ProspectAutoCaptureModal({
  onClose,
  onSubmit,
  initialProgress,
}: ProspectAutoCaptureModalProps) {
  const [mounted, setMounted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [configChecking, setConfigChecking] = useState(true)
  const [keyConfigured, setKeyConfigured] = useState(false)
  const [error, setError] = useState('')
  const [showPresets, setShowPresets] = useState(true)
  const [progress, setProgress] = useState<CaptureProgress | null>(initialProgress || null)
  
  const [form, setForm] = useState<AutoCaptureFormData>({
    province: 'Cádiz',
    city: '',
    manualKeywordInput: '',
    selectedKeywords: ['estética'],
    selectedPresetGroup: null,
    limit: 50,
    mode: 'single',
  })

  useEffect(() => {
    setMounted(true)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  const cityOptions = useMemo(() => getCitiesForProvince(form.province), [form.province])

  const previewQueries = useMemo(() => {
    const keywords = form.selectedKeywords.length > 0 ? form.selectedKeywords : [form.manualKeywordInput || 'estética']
    return keywords.map(keyword => buildProspectAutoCaptureQuery({
      keyword,
      city: form.city,
      province: form.province,
    }))
  }, [form.selectedKeywords, form.manualKeywordInput, form.city, form.province])

  const hasKeywordsSelected = form.selectedKeywords.length > 0 || form.manualKeywordInput.trim().length > 0

  const isBatchMode = form.mode === 'batch' || form.selectedKeywords.length > 1

  const selectPresetGroup = (group: KeywordPresetGroup) => {
    setForm(prev => ({
      ...prev,
      selectedPresetGroup: group.id,
      selectedKeywords: group.keywords,
      mode: 'batch',
    }))
  }

  const clearPresetGroup = () => {
    setForm(prev => ({
      ...prev,
      selectedPresetGroup: null,
    }))
  }

  const toggleKeyword = (keyword: KeywordPreset) => {
    setForm(prev => {
      const exists = prev.selectedKeywords.includes(keyword)
      const newKeywords = exists
        ? prev.selectedKeywords.filter(k => k !== keyword)
        : [...prev.selectedKeywords, keyword]
      return {
        ...prev,
        selectedKeywords: newKeywords,
        selectedPresetGroup: null, // Clear preset group if manually modifying
        mode: newKeywords.length > 1 ? 'batch' : prev.mode,
      }
    })
  }

  const addManualKeyword = () => {
    const keyword = form.manualKeywordInput.trim()
    if (!keyword) return
    setForm(prev => ({
      ...prev,
      selectedKeywords: prev.selectedKeywords.includes(keyword as KeywordPreset)
        ? prev.selectedKeywords
        : [...prev.selectedKeywords, keyword as KeywordPreset],
      manualKeywordInput: '',
      selectedPresetGroup: null,
      mode: 'batch',
    }))
  }

  const clearAllKeywords = () => {
    setForm(prev => ({
      ...prev,
      selectedKeywords: [],
      selectedPresetGroup: null,
      manualKeywordInput: '',
    }))
  }

  const removeKeyword = (keyword: string) => {
    setForm(prev => ({
      ...prev,
      selectedKeywords: prev.selectedKeywords.filter(k => k !== keyword),
      selectedPresetGroup: null,
    }))
  }

  useEffect(() => {
    let cancelled = false

    const checkConfig = async () => {
      setConfigChecking(true)
      try {
        const config = await fetchProspectAutoCaptureConfig()
        console.info('[Auto captar] backend key exists:', config.keyExists, 'source:', config.keySource)
        if (cancelled) return
        setKeyConfigured(config.keyExists)
        setError(
          config.keyExists
            ? ''
            : 'El proveedor OpenStreetMap/Overpass no está disponible. Revisa PROSPECT_PROVIDER en Netlify y vuelve a desplegar.'
        )
      } catch (configError) {
        if (cancelled) return
        setKeyConfigured(false)
        setError((configError as Error).message || 'No se pudo verificar la configuración.')
      } finally {
        if (!cancelled) {
          setConfigChecking(false)
        }
      }
    }

    checkConfig().catch(console.error)

    return () => {
      cancelled = true
    }
  }, [])

  if (!mounted) return null

  return createPortal(
    <>
      <div className="fixed inset-0 z-[5000] bg-black/55" onClick={onClose} aria-hidden="true" />
      <div className="fixed inset-0 z-[5001] flex items-center justify-center p-4 sm:p-6">
        <div
          className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl"
          onClick={event => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Auto captar prospectos"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-bold text-gray-900">Auto captar</h2>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>

          <form
            className="space-y-4 p-5"
            onSubmit={async event => {
              event.preventDefault()
              if (!hasKeywordsSelected) {
                setError('Selecciona al menos un keyword para buscar.')
                return
              }
              setSubmitting(true)
              setProgress({
                isRunning: true,
                currentKeywordIndex: 0,
                totalKeywords: form.selectedKeywords.length || 1,
                currentKeyword: form.selectedKeywords[0] || form.manualKeywordInput || 'estética',
                processedCount: 0,
                totalCount: form.limit,
                addedCount: 0,
                skippedCount: 0,
                errorCount: 0,
              })
              if (keyConfigured) setError('')
              try {
                if (!keyConfigured) {
                  throw new Error(
                    'El proveedor OpenStreetMap/Overpass no está disponible. Revisa PROSPECT_PROVIDER en Netlify y vuelve a desplegar.'
                  )
                }
                const keywords = form.selectedKeywords.length > 0 
                  ? form.selectedKeywords 
                  : [form.manualKeywordInput.trim() || 'estética']
                await onSubmit({
                  province: form.province,
                  city: form.city.trim() || undefined,
                  keyword: keywords[0],
                  keywords: keywords.length > 1 ? keywords : undefined,
                  limit: form.limit,
                  mode: keywords.length > 1 ? 'batch' : 'single',
                })
              } catch (submitError) {
                setError((submitError as Error).message || 'No se pudo completar la captura.')
              } finally {
                setSubmitting(false)
                setProgress(prev => prev ? { ...prev, isRunning: false } : null)
              }
            }}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Provincia</label>
                <select
                  value={form.province}
                  onChange={event =>
                    setForm(previous => ({
                      ...previous,
                      province: event.target.value,
                      city: '',
                    }))
                  }
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {PROSPECT_PROVINCES.map(province => (
                    <option key={province} value={province}>{province}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Ciudad</label>
                <select
                  value={form.city}
                  onChange={event => setForm(previous => ({ ...previous, city: event.target.value }))}
                  disabled={cityOptions.length === 0}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:bg-gray-100"
                >
                  <option value="">Todas / Selecciona una ciudad</option>
                  {cityOptions.map(city => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Keyword Preset Groups */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setShowPresets(!showPresets)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <span className="font-medium text-gray-700">Plantillas de búsqueda</span>
                  {form.selectedPresetGroup && (
                    <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                      {KEYWORD_PRESET_GROUPS.find(g => g.id === form.selectedPresetGroup)?.name}
                    </span>
                  )}
                </div>
                {showPresets ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>
              
              {showPresets && (
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {KEYWORD_PRESET_GROUPS.map(group => (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => selectPresetGroup(group)}
                        className={`text-left p-3 rounded-lg border transition-colors ${
                          form.selectedPresetGroup === group.id
                            ? 'border-emerald-500 bg-emerald-50'
                            : 'border-gray-200 hover:border-emerald-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="font-medium text-sm text-gray-900">{group.name}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{group.description}</div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {group.keywords.slice(0, 3).map(k => (
                            <span key={k} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                              {k}
                            </span>
                          ))}
                          {group.keywords.length > 3 && (
                            <span className="text-xs text-gray-400">+{group.keywords.length - 3}</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Selected Keywords Display */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Keywords seleccionados
                  <span className="ml-1 text-xs text-gray-400">({form.selectedKeywords.length})</span>
                </label>
                {form.selectedKeywords.length > 0 && (
                  <button
                    type="button"
                    onClick={clearAllKeywords}
                    className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    Limpiar todo
                  </button>
                )}
              </div>
              
              {form.selectedKeywords.length > 0 ? (
                <div className="flex flex-wrap gap-2 mb-3">
                  {form.selectedKeywords.map(keyword => (
                    <span
                      key={keyword}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-700 text-sm rounded-full"
                    >
                      {keyword}
                      <button
                        type="button"
                        onClick={() => removeKeyword(keyword)}
                        className="hover:text-emerald-900"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-400 italic mb-3">Ningún keyword seleccionado</div>
              )}

              {/* Manual keyword input */}
              <div className="flex gap-2">
                <input
                  value={form.manualKeywordInput}
                  onChange={event => setForm(previous => ({ ...previous, manualKeywordInput: event.target.value }))}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addManualKeyword()
                    }
                  }}
                  placeholder="Añadir keyword personalizado..."
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={addManualKeyword}
                  disabled={!form.manualKeywordInput.trim()}
                  className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Añadir
                </button>
              </div>
            </div>

            {/* Keyword Presets Grid */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Keywords predefinidos</label>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 border border-gray-200 rounded-lg">
                {KEYWORD_PRESETS.map(preset => {
                  const isSelected = form.selectedKeywords.includes(preset)
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => toggleKeyword(preset)}
                      className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                        isSelected
                          ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-300 hover:bg-gray-50'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        {isSelected && <Check className="w-3 h-3" />}
                        {preset}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Límite por keyword</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={form.limit}
                  onChange={event => setForm(previous => ({ ...previous, limit: Number(event.target.value) || 50 }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Máximo {form.limit} resultados por keyword
                </p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Modo de ejecución</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, mode: 'single' }))}
                    className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                      form.mode === 'single' && form.selectedKeywords.length <= 1
                        ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <Play className="w-4 h-4 inline mr-1" />
                    Simple
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, mode: 'batch' }))}
                    className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                      isBatchMode
                        ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <RotateCcw className="w-4 h-4 inline mr-1" />
                    Lote ({form.selectedKeywords.length || 1})
                  </button>
                </div>
              </div>
            </div>

            {/* Query Preview */}
            <div className="rounded-lg bg-gray-50 p-3 text-sm">
              <div className="text-gray-600 mb-2">
                {previewQueries.length === 1 
                  ? 'Se buscarán negocios públicos en OpenStreetMap usando la consulta:'
                  : `Se ejecutarán ${previewQueries.length} búsquedas en lote:`}
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {previewQueries.map((query, index) => (
                  <div key={index} className="font-medium text-gray-900 font-mono text-xs bg-white p-2 rounded border border-gray-200">
                    {index + 1}. {query}
                  </div>
                ))}
              </div>
            </div>

            {/* Progress Display */}
            {progress?.isRunning && (
              <div className="rounded-lg bg-blue-50 p-4 border border-blue-200">
                <div className="flex items-center gap-2 mb-2">
                  <RotateCcw className="w-4 h-4 text-blue-600 animate-spin" />
                  <span className="font-medium text-blue-900">
                    Procesando keyword {progress.currentKeywordIndex + 1} de {progress.totalKeywords}
                  </span>
                </div>
                <div className="text-sm text-blue-700 mb-2">
                  <span className="font-medium">{progress.currentKeyword}</span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2 mb-3">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${((progress.currentKeywordIndex) / progress.totalKeywords) * 100}%` }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-white rounded p-2 text-center">
                    <div className="font-bold text-emerald-600">{progress.addedCount}</div>
                    <div className="text-gray-500">Añadidos</div>
                  </div>
                  <div className="bg-white rounded p-2 text-center">
                    <div className="font-bold text-amber-600">{progress.skippedCount}</div>
                    <div className="text-gray-500">Duplicados</div>
                  </div>
                  <div className="bg-white rounded p-2 text-center">
                    <div className="font-bold text-red-600">{progress.errorCount}</div>
                    <div className="text-gray-500">Errores</div>
                  </div>
                </div>
              </div>
            )}

            {configChecking && (
              <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
                Comprobando configuración del backend…
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-3 border-t border-gray-100 pt-3">
              <button
                type="button"
                onClick={onClose}
                className={getProspectModalButtonClass('slate', 'secondary')}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting || configChecking || !hasKeywordsSelected}
                className={getProspectModalButtonClass('emerald')}
              >
                {submitting 
                  ? isBatchMode 
                    ? `Procesando ${form.selectedKeywords.length} keywords…` 
                    : 'Buscando…'
                  : isBatchMode 
                    ? `Iniciar lote (${form.selectedKeywords.length} keywords)` 
                    : 'Empezar captura'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>,
    document.body
  )
}
