export type ViewSnapshot = {
  tab: string;
  selfProfileOpen: boolean;
  settingsOpen: boolean;
  openConversationId: string | null;
  selectedHouseId: number | string | null;
  peopleListOpen: boolean;
};

export function pushView(stack: ViewSnapshot[], snap: ViewSnapshot): ViewSnapshot[] {
  return [...stack, snap];
}

export function popView(stack: ViewSnapshot[]): { stack: ViewSnapshot[]; previous: ViewSnapshot | null } {
  if (stack.length === 0) return { stack, previous: null };
  const previous = stack[stack.length - 1];
  return { stack: stack.slice(0, -1), previous };
}
