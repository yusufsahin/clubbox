class ClubboxClipProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.armed = false;
    this.capacity = Math.floor(sampleRate * 30);
    this.left = new Float32Array(this.capacity);
    this.right = new Float32Array(this.capacity);
    this.write = 0;
    this.filled = 0;
    this.port.onmessage = (event) => {
      if (event.data === 'arm' || event.data === 'disarm') {
        this.armed = event.data === 'arm';
        this.write = 0;
        this.filled = 0;
        return;
      }
      if (event.data !== 'dump') return;
      const frames = this.filled;
      const left = new Float32Array(frames);
      const right = new Float32Array(frames);
      const start = frames < this.capacity ? 0 : this.write;
      for (let i = 0; i < frames; i++) {
        const index = (start + i) % this.capacity;
        left[i] = this.left[index];
        right[i] = this.right[index];
      }
      this.port.postMessage({ type: 'clip', sampleRate, left, right }, [left.buffer, right.buffer]);
    };
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (output) {
      for (const channel of output) channel.fill(0);
    }
    if (!this.armed) return true;
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const leftIn = input[0];
    const rightIn = input[1] || input[0];
    for (let i = 0; i < leftIn.length; i++) {
      this.left[this.write] = leftIn[i];
      this.right[this.write] = rightIn[i];
      this.write = (this.write + 1) % this.capacity;
      if (this.filled < this.capacity) this.filled += 1;
    }
    return true;
  }
}

registerProcessor('clubbox-clip', ClubboxClipProcessor);
