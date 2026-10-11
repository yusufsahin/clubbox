/** Former sidebar places → where they live after Phase 16 (NAV-2). */
export const FORMER_PLACE_HOME: Record<string, string> = {
  Friends: 'Discover',
  Houses: 'Discover',
  Events: 'Activity',
  'API & Config': 'Settings',
};

export function homeForFormerPlace(oldPlace: string): string | undefined {
  return FORMER_PLACE_HOME[oldPlace];
}

/** Sidebar highlight when viewing a merged/sub place. */
export function sidebarHighlightTab(currentTab: string): string {
  if (currentTab === 'friends' || currentTab === 'houses') return 'discover';
  if (currentTab === 'events') return 'activity';
  if (currentTab === 'stage' || currentTab === 'replay' || currentTab === 'login') return '';
  return currentTab;
}
