import { wireActivityCtl } from './activityCtl.ts';
import { wireHallwayCtl } from './hallwayCtl.ts';
import { wireMessagesCtl } from './messagesCtl.ts';
import { wireProfileCtl } from './profileCtl.ts';
import { wireRoomCtl } from './roomCtl.ts';
import { wireSettingsCtl } from './settingsCtl.ts';
import { wireStudioCtl } from './studioCtl.ts';

export function wireAppControllers(ClubboxApp: new (...args: never[]) => unknown): void {
  const proto = ClubboxApp.prototype as Record<string, unknown>;
  wireActivityCtl(proto as never);
  wireHallwayCtl(proto as never);
  wireMessagesCtl(proto as never);
  wireProfileCtl(proto as never);
  wireRoomCtl(proto as never);
  wireSettingsCtl(proto as never);
  wireStudioCtl(proto as never);
}
