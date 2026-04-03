import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getProspectModalButtonClass,
  getProspectPopupButtonClass,
  getProspectToolbarButtonClass,
} from './prospectActionButtonStyles'

test('toolbar prospect buttons keep white text across interaction states', () => {
  const className = getProspectToolbarButtonClass('emerald')

  assert.match(className, /text-white/)
  assert.match(className, /hover:text-white/)
  assert.match(className, /active:text-white/)
  assert.match(className, /focus:text-white/)
  assert.match(className, /focus-visible:text-white/)
})

test('modal secondary action still renders with white text and readable darker background', () => {
  const className = getProspectModalButtonClass('slate', 'secondary')

  assert.match(className, /bg-slate-700/)
  assert.match(className, /text-white/)
  assert.match(className, /hover:bg-slate-800/)
})

test('popup action buttons keep white text and compact spacing', () => {
  const className = getProspectPopupButtonClass('blue')

  assert.match(className, /text-white/)
  assert.match(className, /px-2\.5 py-1 text-xs/)
  assert.match(className, /hover:text-white/)
})
