import { pipeline, env } from '@xenova/transformers';

// Disable local models to fetch from HuggingFace hub
env.allowLocalModels = false;

// We use the tiny english whisper model for fast web inference
const MODEL_ID = 'Xenova/whisper-tiny.en';

let transcriber: any = null;

// Initialize the model
async function initTranscriber() {
  if (transcriber === null) {
    transcriber = await pipeline('automatic-speech-recognition', MODEL_ID, {
      progress_callback: (data: any) => {
        self.postMessage({ status: 'progress', data });
      }
    });
    self.postMessage({ status: 'ready' });
  }
}

self.addEventListener('message', async (e) => {
  const { type, audio } = e.data;

  if (type === 'init') {
    await initTranscriber();
  }

  if (type === 'transcribe') {
    try {
      if (!transcriber) await initTranscriber();
      
      const result = await transcriber(audio, {
        chunk_length_s: 30,
        stride_length_s: 5,
        language: 'english',
        task: 'transcribe',
      });
      
      self.postMessage({ status: 'complete', text: result.text, isFinal: e.data.isFinal });
    } catch (error: any) {
      self.postMessage({ status: 'error', error: error.message });
    }
  }
});
