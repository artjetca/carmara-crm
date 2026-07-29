export function getSidebarLayoutClasses(isMapWorkspace: boolean, mapSidebarExpanded: boolean) {
  const isCollapsedMapSidebar = isMapWorkspace && !mapSidebarExpanded

  return {
    header: `flex items-center justify-between border-b border-blue-800 p-4 ${isCollapsedMapSidebar ? 'md:justify-center md:p-3' : ''}`,
    brand: `flex items-center space-x-3 ${isCollapsedMapSidebar ? 'md:hidden' : ''}`,
    userInfo: `border-b border-blue-800 p-4 ${isCollapsedMapSidebar ? 'md:hidden' : ''}`,
    navigation: `flex-1 space-y-2 p-4 ${isCollapsedMapSidebar ? 'md:p-2' : ''}`,
    navigationItem: `flex w-full items-center space-x-3 rounded-lg px-3 py-3 text-left transition-colors md:py-2 ${isCollapsedMapSidebar ? 'md:w-12 md:justify-center md:space-x-0 md:px-0' : ''}`,
    navigationLabel: `font-medium ${isCollapsedMapSidebar ? 'md:hidden' : ''}`,
    footer: `border-t border-blue-800 p-4 ${isCollapsedMapSidebar ? 'md:p-2' : ''}`,
    logout: `flex w-full items-center space-x-3 rounded-lg px-3 py-2 text-blue-100 transition-colors hover:bg-blue-800 hover:text-white ${isCollapsedMapSidebar ? 'md:w-12 md:justify-center md:space-x-0 md:px-0' : ''}`,
  }
}
