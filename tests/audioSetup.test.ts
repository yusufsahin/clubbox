import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareAudioDevices,
  deviceBadge,
  displayDeviceLabel,
  missingChosenDevices,
  suggestAudioSetup,
  type ListedDevice,
} from '../src/audio/devicePicker.ts';
import { t } from '../src/i18n/index.ts';
import { markup } from '../src/ui/html.ts';
import { audioSetupWizard } from '../src/ui/components/audioSetupWizard.ts';
import { installedAudioSummary } from '../src/audio/devicePicker.ts';

const devices: ListedDevice[] = [
  { id: 'mic', label: 'Microphone (Realtek)', kind: 'audioinput' },
  { id: 'cable-cap', label: 'CABLE Output (2- VB-Audio Virtual Cable)', kind: 'audioinput' },
  { id: 'cable-ren', label: 'Speakers (2- VB-Audio Virtual Cable)', kind: 'audiooutput' },
  { id: 'phones', label: 'Headphones (Realtek)', kind: 'audiooutput' },
  { id: 'vm-cap', label: 'VoiceMeeter Output', kind: 'audioinput' },
  { id: 'vm-aux', label: 'VoiceMeeter Aux Input', kind: 'audiooutput' },
  { id: 'bh', label: 'BlackHole 2ch', kind: 'audioinput' },
  { id: 'lb', label: 'Loopback Audio', kind: 'audiooutput' },
];

test('device badges name the virtual family and instance', () => {
  assert.equal(deviceBadge(devices[1]!), 'VB-Cable 2');
  assert.equal(deviceBadge({ label: 'CABLE Output (VB-Audio Virtual Cable)', kind: 'audioinput' }), 'VB-Cable');
  assert.equal(deviceBadge(devices[4]!), 'Voicemeeter');
  assert.equal(deviceBadge(devices[5]!), 'Voicemeeter AUX');
  assert.equal(deviceBadge(devices[6]!), 'BlackHole');
  assert.equal(deviceBadge(devices[7]!), 'Loopback');
  assert.equal(deviceBadge(devices[0]!), null);
});

test('virtual devices sort ahead of physical ones', () => {
  const sorted = [...devices].sort(compareAudioDevices);
  const firstPhysical = sorted.findIndex((device) => deviceBadge(device) === null);
  assert.ok(firstPhysical > 0);
  assert.ok(sorted.slice(0, firstPhysical).every((device) => deviceBadge(device) !== null));
});

test('unavailable devices keep their badge and a mark', () => {
  assert.equal(
    displayDeviceLabel(devices[1]!, true, 'unavailable'),
    '[VB-Cable 2] CABLE Output (2- VB-Audio Virtual Cable) — unavailable',
  );
});

test('setup suggestions stay as a draft', () => {
  const mix = suggestAudioSetup(devices, 'mix', 'high');
  assert.deepEqual(mix, {
    micId: 'mic',
    externalId: 'cable-cap',
    outputId: 'phones',
    quality: 'high',
  });
  const mixer = suggestAudioSetup(devices, 'mixer', 'normal');
  assert.deepEqual(mixer, {
    micId: 'vm-cap',
    externalId: '',
    outputId: 'vm-aux',
    quality: 'music',
  });
});

test('missing chosen devices ignore blanks and system audio', () => {
  assert.deepEqual(
    missingChosenDevices(['gone', '', '__system_audio__', 'mic', 'gone'], ['mic', 'phones']),
    ['gone'],
  );
});

test('step 2 shows both setups and does not apply them', () => {
  const html = markup(audioSetupWizard({
    step: 2,
    summary: installedAudioSummary(devices),
    devices,
    unavailable: new Set(),
    draft: { micId: '', externalId: '', outputId: '', quality: 'normal' },
    choice: null,
    loopClear: true,
  }));
  assert.match(html, new RegExp(t('audioSetup1Title')));
  assert.match(html, new RegExp(t('audioSetup2Title')));
  assert.doesNotMatch(html, /data-action="audio-setup-apply"/);
});
