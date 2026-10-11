import type { ClubboxApp } from './clubboxApp.ts';
import { wireActivityCtl } from './activityCtl.ts';
import { wireHallwayCtl } from './hallwayCtl.ts';
import { wireMessagesCtl } from './messagesCtl.ts';
import { wireProfileCtl } from './profileCtl.ts';
import { wireRoomCtl } from './roomCtl.ts';
import { wireSettingsCtl } from './settingsCtl.ts';
import { wireStudioCtl } from './studioCtl.ts';

export function wireAppControllers(ClubboxAppClass: typeof ClubboxApp): void {
  const proto = ClubboxAppClass.prototype;
  wireActivityCtl(proto);
  wireHallwayCtl(proto);
  wireMessagesCtl(proto);
  wireProfileCtl(proto);
  wireRoomCtl(proto);
  wireSettingsCtl(proto);
  wireStudioCtl(proto);
}
