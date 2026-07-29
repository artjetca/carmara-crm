import test from 'node:test'
import assert from 'node:assert/strict'
import { getSidebarLayoutClasses } from './layoutStyles'

test('collapsed map sidebar keeps full mobile drawer spacing while applying desktop rail overrides', () => {
  const classes = getSidebarLayoutClasses(true, false)

  assert.match(classes.header, /justify-between/)
  assert.match(classes.header, /p-4/)
  assert.match(classes.header, /md:justify-center/)
  assert.match(classes.userInfo, /p-4/)
  assert.match(classes.userInfo, /md:hidden/)
  assert.match(classes.navigation, /p-4/)
  assert.match(classes.navigation, /md:p-2/)
  assert.match(classes.navigationItem, /w-full/)
  assert.match(classes.navigationItem, /space-x-3/)
  assert.match(classes.navigationItem, /px-3/)
  assert.match(classes.navigationItem, /md:w-12/)
  assert.match(classes.navigationItem, /md:space-x-0/)
  assert.match(classes.footer, /p-4/)
  assert.match(classes.logout, /w-full/)
  assert.match(classes.logout, /space-x-3/)
})

test('expanded and non-map sidebars keep the brand block visible', () => {
  assert.doesNotMatch(getSidebarLayoutClasses(true, true).brand, /md:hidden/)
  assert.doesNotMatch(getSidebarLayoutClasses(false, false).brand, /md:hidden/)
})

test('collapsed desktop map sidebar hides the brand and labels so the 64px rail stays compact', () => {
  const classes = getSidebarLayoutClasses(true, false)

  assert.match(classes.brand, /md:hidden/)
  assert.match(classes.navigationLabel, /md:hidden/)
})
