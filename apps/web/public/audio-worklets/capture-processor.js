/**
 * Audio Worklet Processor for capturing microphone audio for Gemini Live.
 *
 * Buffers raw mic samples into fixed-size chunks and posts them to the main
 * thread, which converts them to 16-bit PCM and sends them to Gemini.
 *
 * Adapted from Google's official reference implementation:
 * https://github.com/google-gemini/gemini-live-api-examples/blob/main/gemini-live-ephemeral-tokens-websocket/frontend/audio-processors/capture.worklet.js
 */

class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 512; // 32ms at 16kHz — per Gemini best practices (20-40ms chunks)
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs) {
    const input = inputs[0];

    if (input && input.length > 0) {
      const inputChannel = input[0];

      for (let i = 0; i < inputChannel.length; i++) {
        this.buffer[this.bufferIndex++] = inputChannel[i];

        if (this.bufferIndex >= this.bufferSize) {
          this.port.postMessage({
            type: "audio",
            data: this.buffer.slice(),
          });
          this.bufferIndex = 0;
        }
      }
    }

    return true;
  }
}

registerProcessor("audio-capture-processor", AudioCaptureProcessor);
