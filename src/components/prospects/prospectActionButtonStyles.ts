import { clsx } from 'clsx'

type ProspectButtonTone =
  | 'emerald'
  | 'blue'
  | 'violet'
  | 'slate'
  | 'indigo'
  | 'red'

const TONE_CLASSES: Record<ProspectButtonTone, string> = {
  emerald: 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 focus-visible:ring-emerald-500',
  blue: 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 focus-visible:ring-blue-500',
  violet: 'bg-violet-600 hover:bg-violet-700 active:bg-violet-800 focus-visible:ring-violet-500',
  slate: 'bg-slate-700 hover:bg-slate-800 active:bg-slate-900 focus-visible:ring-slate-500',
  indigo: 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 focus-visible:ring-indigo-500',
  red: 'bg-red-600 hover:bg-red-700 active:bg-red-800 focus-visible:ring-red-500',
}

const SHARED_BUTTON_CLASSES =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-transparent font-medium text-white hover:text-white active:text-white focus:text-white focus-visible:text-white shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 [text-shadow:0_1px_1px_rgba(15,23,42,0.35)] disabled:opacity-50 disabled:cursor-not-allowed'

export function getProspectToolbarButtonClass(
  tone: ProspectButtonTone,
  size: 'sm' | 'md' = 'sm'
) {
  return clsx(
    SHARED_BUTTON_CLASSES,
    TONE_CLASSES[tone],
    size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-1.5 text-sm'
  )
}

export function getProspectModalButtonClass(
  tone: ProspectButtonTone,
  emphasis: 'primary' | 'secondary' = 'primary'
) {
  return clsx(
    SHARED_BUTTON_CLASSES,
    TONE_CLASSES[tone],
    emphasis === 'primary' ? 'px-5 py-2 text-sm' : 'px-4 py-2 text-sm'
  )
}

export function getProspectPopupButtonClass(tone: 'emerald' | 'blue' | 'indigo') {
  return clsx(
    SHARED_BUTTON_CLASSES,
    TONE_CLASSES[tone],
    'px-2.5 py-1 text-xs'
  )
}
