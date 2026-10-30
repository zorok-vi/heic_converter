import type { Job } from '../queue/Queue';
import type { Settings } from '../conversion/types';
import { bytes, sameSettings, settingsLabel } from '../utils/files';

const labels = { queued: 'В очереди', processing: 'Обработка…', done: 'Готово', error: 'Ошибка', cancelled: 'Отменено' };
export function FileRow({ job, settings, disabled, preparing, onRemove, onDiscard }: {
  job: Job; settings: Settings; disabled: boolean; preparing: boolean; onRemove: () => void; onDiscard: () => void;
}) {
  const result = job.result;
  return <li className="file-row" data-state={job.state}>
    <div className="thumbnail">{result ? <img src={result.url} loading="lazy" decoding="async" alt={`Результат: ${job.file.name}`} /> : <span aria-hidden="true">HEIC</span>}</div>
    <div className="file-info">
      <p className="file-name" title={job.file.name}>{job.file.name}</p>
      <p className="file-size">{bytes(job.file.size)}{result && <> → {bytes(result.blob.size)} <span>· {result.width} × {result.height}</span></>}</p>
      {result && <p className="result-settings">{settingsLabel(result.settings)} · <span className="result-name">{result.name}</span></p>}
      {result && !sameSettings(result.settings, settings) && <p className="changed-settings">Создан с прежними параметрами. Для обновления нажмите «Конвертировать всё заново».</p>}
      {job.message && <p className={job.state === 'error' ? 'file-error' : 'file-message'}>{job.message}</p>}
    </div>
    <span className={`status status-${job.state}`}>{job.state === 'processing' && <span className="spinner" aria-hidden="true" />}{job.state === 'processing' && preparing ? 'Подготовка конвертера…' : labels[job.state]}</span>
    <div className="file-actions">
      {result && <><a className="button small" href={result.url} download={result.name} aria-label={`Скачать ${result.name}`}>Скачать</a>
        <button className="text-button small" disabled={disabled} onClick={onDiscard} aria-label={`Удалить результат ${job.file.name}`}>Убрать результат</button></>}
      <button className="icon-button" disabled={disabled} onClick={onRemove} aria-label={`Удалить файл ${job.file.name}`} title="Удалить из списка">×</button>
    </div>
  </li>;
}
