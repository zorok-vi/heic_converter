import type { ConvertRequest, ConvertResponse } from './types';

self.onmessage = async (event: MessageEvent<ConvertRequest>) => {
  const { runId, jobId, file, settings } = event.data;
  const send = (data: ConvertResponse) => self.postMessage(data);
  try {
    const { convert } = await import('./adapter');
    const result = await convert(file, settings, () => send({ runId, jobId, phase: 'ready' }));
    send({ runId, jobId, phase: 'done', result });
  } catch (error) {
    const message = error instanceof Error && /[А-Яа-яЁё]/.test(error.message)
      ? error.message : 'Не удалось декодировать HEIC. Файл повреждён, не поддерживается или требует слишком много памяти.';
    send({ runId, jobId, phase: 'error', message });
  }
};
