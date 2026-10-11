import type { VoiceEffectId } from './voiceEffects';

export type EffectChain = {
  input: AudioNode;
  output: AudioNode;
  dispose: () => void;
};

function passthrough(ctx: AudioContext): EffectChain {
  const gain = ctx.createGain();
  gain.gain.value = 1;
  return {
    input: gain,
    output: gain,
    dispose: () => {
      try {
        gain.disconnect();
      } catch {
        // Already disconnected.
      }
    },
  };
}

/** Stable stereo pan in [-0.85, 0.85] from a remote uid — local output only. */
export function panForUid(uid: string): number {
  let hash = 0;
  for (let i = 0; i < uid.length; i += 1) {
    hash = (hash * 31 + uid.charCodeAt(i)) | 0;
  }
  const unit = ((hash >>> 0) % 1701) / 1700; // 0..1
  return (unit * 2 - 1) * 0.85;
}

/**
 * Lightweight Web Audio colouring for voice effects.
 * Preview/apply routing is owned by AudioEngine (monitor vs broadcast).
 */
export function createVoiceEffectChain(ctx: AudioContext, effect: VoiceEffectId): EffectChain {
  if (effect === 'none') return passthrough(ctx);

  const nodes: AudioNode[] = [];
  const dispose = () => {
    for (const node of nodes) {
      try {
        node.disconnect();
      } catch {
        // Already disconnected.
      }
    }
  };

  if (effect === 'radio') {
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    filter.Q.value = 0.7;
    const shaper = ctx.createWaveShaper();
    shaper.curve = makeDistortionCurve(28);
    shaper.oversample = '2x';
    filter.connect(shaper);
    nodes.push(filter, shaper);
    return { input: filter, output: shaper, dispose };
  }

  if (effect === 'deep') {
    const shelf = ctx.createBiquadFilter();
    shelf.type = 'lowshelf';
    shelf.frequency.value = 220;
    shelf.gain.value = 8;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 2400;
    shelf.connect(lowpass);
    nodes.push(shelf, lowpass);
    return { input: shelf, output: lowpass, dispose };
  }

  if (effect === 'robot') {
    const input = ctx.createGain();
    const delay = ctx.createDelay(0.05);
    delay.delayTime.value = 0.012;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 40;
    const mod = ctx.createGain();
    mod.gain.value = 0.006;
    osc.connect(mod);
    mod.connect(delay.delayTime);
    osc.start();
    input.connect(delay);
    nodes.push(input, delay, osc, mod);
    return {
      input,
      output: delay,
      dispose: () => {
        try {
          osc.stop();
        } catch {
          // Already stopped.
        }
        dispose();
      },
    };
  }

  // echo
  const input = ctx.createGain();
  const dry = ctx.createGain();
  dry.gain.value = 0.85;
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.22;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.35;
  const wet = ctx.createGain();
  wet.gain.value = 0.45;
  const mix = ctx.createGain();
  input.connect(dry);
  input.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(wet);
  dry.connect(mix);
  wet.connect(mix);
  nodes.push(input, dry, delay, feedback, wet, mix);
  return { input, output: mix, dispose };
}

function makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const samples = 44100;
  const curve = new Float32Array(new ArrayBuffer(samples * 4));
  const deg = Math.PI / 180;
  for (let i = 0; i < samples; i += 1) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}
