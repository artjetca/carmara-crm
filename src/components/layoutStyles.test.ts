import test from 'node:test'
import assert from 'node:assert/strict'
import { getSidebarBrandClass } from './layoutStyles'

test('collapsed desktop map sidebar hides the brand block so the menu fits the 64px rail', () => {
  const className = getSidebarBrandClass(true, false)

  assert.match(className, /md:hidden/)
})

test('expanded and non-map sidebars keep the brand block visible', () => {
  assert.doesNotMatch(getSidebarBrandClass(true, true), /md:hidden/)
  assert.doesNotMatch(getSidebarBrandClass(false, false), /md:hidden/)
})
