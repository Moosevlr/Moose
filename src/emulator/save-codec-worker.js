import { runSaveCodecOperation } from './save-codec.js';

self.onmessage = async ({ data }) => {
  const { id, operation, payload } = data;
  try {
    const result = await runSaveCodecOperation(operation, payload);
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: { name: error.name || 'Error', message: error.message || 'Não foi possível processar o SAVE.' } });
  }
};
