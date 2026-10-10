function clampSample(sample: number): number {
  const bounded = Math.max(-1, Math.min(1, sample));
  return bounded < 0 ? bounded * 0x8000 : bounded * 0x7fff;
}

export function encodeStereoWav(left: Float32Array, right: Float32Array, sampleRate: number): Blob {
  const frames = Math.min(left.length, right.length);
  const bytes = new ArrayBuffer(44 + frames * 4);
  const view = new DataView(bytes);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + frames * 4, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, frames * 4, true);
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    view.setInt16(offset, clampSample(left[i]), true);
    view.setInt16(offset + 2, clampSample(right[i]), true);
    offset += 4;
  }
  return new Blob([bytes], { type: 'audio/wav' });
}
