export function getSidebarBrandClass(isMapWorkspace: boolean, mapSidebarExpanded: boolean) {
  return `flex items-center space-x-3 ${isMapWorkspace && !mapSidebarExpanded ? 'md:hidden' : ''}`
}
