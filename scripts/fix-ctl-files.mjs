import fs from 'node:fs';
import path from 'node:path';

const appDir = path.join(path.resolve(import.meta.dirname, '..'), 'src', 'app');
const ctlFiles = fs.readdirSync(appDir).filter((f) => f.endsWith('Ctl.ts'));

const sharedImports = `import { ClubhouseApiError, clubhouseClient } from '../api/client.ts';
import { beginJoin, commitJoin, finishLeave, localClipAllowed, roleSyncDecision, roomAudience } from '../api/guards.ts';
import { capturedCreateBody, leaveClosesRoom, roomHasOthers } from '../api/roomActions.ts';
import { PubNubRoomSource } from '../api/pubnubRoomSource.ts';
import { roomSync } from '../api/roomSync.ts';
import { audioEngine } from '../audio/audioEngine.ts';
import { agoraVoice } from '../audio/agoraVoice.ts';
import type { CHChannelDetail } from '../api/types.ts';
import { t } from '../i18n/index.ts';
import { mountSpeakerInvite } from '../ui/components/speakerInvite.ts';
import { showToast } from '../ui/components/toast.ts';
import { safeUrl } from '../ui/html.ts';
import type { ClubboxApp } from './clubboxApp.ts';

type App = ClubboxApp;
`;

for (const file of ctlFiles) {
  const p = path.join(appDir, file);
  let text = fs.readFileSync(p, 'utf8');
  text = text.replace(/^import type[\s\S]*?type App = ClubboxApp;\n\n/m, '');
  text = text.replace(/^  (private |public )?(async )?/gm, 'export function ');
  text = text.replace(/^export function ([a-zA-Z0-9_]+)\((this: App)?/gm, 'export function $1(this: App');
  text = text.replace(/^export function ([a-zA-Z0-9_]+)\(/gm, 'export function $1(this: App, ');
  text = text.replace(/\(this: App, this: App,/g, '(this: App,');
  text = text.replace(/\(this: App\):/g, '(this: App):');
  text = text.replace(/\(this: App, \):/g, '(this: App):');
  text = text.replace(/\(this: App, \)/g, '(this: App)');
  const wireMatch = text.match(/export function wire[\s\S]*$/);
  const wire = wireMatch ? wireMatch[0] : '';
  const body = text.slice(0, wireMatch?.index ?? text.length);
  const fixedWire = wire;
  fs.writeFileSync(p, `${sharedImports}\n${body.trim()}\n\n${fixedWire}\n`);
}

const wireControllers = `${ctlFiles.map((f) => {
  const base = f.replace('.ts', '');
  const fn = `wire${base[0].toUpperCase()}${base.slice(1)}`;
  return `import { ${fn} } from './${base}.ts';`;
}).join('\n')}

export function wireAppControllers(ClubboxApp: new (...args: never[]) => unknown): void {
  const proto = ClubboxApp.prototype as Record<string, unknown>;
  ${ctlFiles.map((f) => {
    const base = f.replace('.ts', '');
    const fn = `wire${base[0].toUpperCase()}${base.slice(1)}`;
    return `${fn}(proto as never);`;
  }).join('\n  ')}
}
`;

fs.writeFileSync(path.join(appDir, 'wireControllers.ts'), wireControllers);
console.log('Fixed', ctlFiles.length, 'controllers');
