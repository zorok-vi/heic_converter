import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Settings } from './conversion/types';
import { LIMITS } from './config';
import { Queue } from './queue/Queue';
import { bytes } from './utils/files';
import { buildZip } from './utils/zip';
import { Downloads } from './utils/download';
import { Upload } from './components/Upload';
import { SettingsPanel } from './components/SettingsPanel';
import { FileRow } from './components/FileRow';

export default function App({ controller }: { controller?: Queue }) {
  const [queue] = useState(() => controller ?? new Queue());
  const state = useSyncExternalStore(queue.subscribe, queue.getSnapshot);
  const [settings, setSettings] = useState<Settings>({ format: 'jpeg', quality: 90 });
  const [zipStatus, setZipStatus] = useState('');
  const [zipping, setZipping] = useState(false);
  const [downloads] = useState(() => new Downloads());
  const zipTask = useRef<AbortController | null>(null);
  const busy = state.busy || zipping;
  const { jobs } = state;
  const results = jobs.flatMap(j => j.result ? [j.result] : []);
  const counts = {
    done: jobs.filter(j => j.state === 'done').length,
    error: jobs.filter(j => j.state === 'error').length,
    cancelled: jobs.filter(j => j.state === 'cancelled').length,
    queued: jobs.filter(j => j.state === 'queued').length,
  };
  const batch = state.batchIds.length ? jobs.filter(j => state.batchIds.includes(j.id)) : jobs;
  const processed = batch.filter(j => ['done', 'error', 'cancelled'].includes(j.state)).length;
  const stored = results.reduce((n, r) => n + r.blob.size, 0);

  useEffect(() => () => { zipTask.current?.abort(); downloads.clear(); queue.dispose(); }, [downloads, queue]);
  useEffect(() => {
    if (!results.length && !state.busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [results.length, state.busy]);

  const clear = () => {
    zipTask.current?.abort(); zipTask.current = null;
    setZipping(false); setZipStatus(''); downloads.clear(); queue.clear();
  };
  const zip = async () => {
    if (busy || !results.length) return;
    const task = new AbortController(); zipTask.current = task;
    setZipping(true); setZipStatus(`Сборка ZIP: 0 из ${results.length}`);
    try {
      const blob = await buildZip(results, task.signal, done => { if (zipTask.current === task) setZipStatus(`Сборка ZIP: ${done} из ${results.length}`); });
      if (task.signal.aborted || zipTask.current !== task) return;
      downloads.save(blob, 'converted-images.zip');
      setZipStatus(`ZIP готов: ${results.length} файлов, ${bytes(blob.size)}. Сохранение передано браузеру.`);
    } catch {
      if (zipTask.current === task) setZipStatus(task.signal.aborted ? 'Сборка ZIP отменена.' : 'Не удалось собрать ZIP. Попробуйте скачать результаты отдельно или освободить память.');
    } finally {
      if (zipTask.current === task) { zipTask.current = null; setZipping(false); }
    }
  };

  return <div className="app-shell">
    <header className="page-header">
      <div className="app-mark" aria-hidden="true">↗</div><span className="app-name">Конвертер фотографий</span>
      <span className="local-badge"><span aria-hidden="true">●</span> На вашем компьютере</span>
    </header>
    <main>
      <div className="intro"><p className="eyebrow">БЕЗ ЗАГРУЗКИ ФОТОГРАФИЙ В СЕТЬ</p>
        <h1>HEIC <span>→</span> JPEG / PNG</h1><p>Локальная конвертация в браузере. Фотографии не передаются на сервер.</p>
      </div>
      <div className="workspace">
        <Upload disabled={busy} onFiles={files => queue.add(files)} />
        <SettingsPanel value={settings} disabled={busy} onChange={setSettings} />
        <div className="toolbar">
          <button className="primary" disabled={busy || !counts.queued} onClick={() => void queue.start(settings)}>Конвертировать{counts.queued > 0 ? ` (${counts.queued})` : ''}</button>
          <button disabled={busy || !(counts.error + counts.cancelled)} onClick={() => void queue.start(settings, 'retry')}>Повторить ошибки{counts.cancelled > 0 ? ' и отменённые' : ''}</button>
          <button disabled={!state.busy && !zipping} onClick={() => state.busy ? queue.cancel() : zipTask.current?.abort()}>{zipping ? 'Отменить ZIP' : 'Отменить'}</button>
          <button className="text-button clear-button" disabled={!jobs.length && !state.notice} onClick={clear}>Очистить список</button>
        </div>
        <div className="live-status" role="status" aria-live="polite" aria-atomic="true">
          {state.busy ? (state.preparing ? 'Подготовка конвертера…' : 'Конвертация в Worker…') : jobs.length ? `Готово: ${counts.done}. С ошибками: ${counts.error}. Отменено: ${counts.cancelled}.` : 'Добавьте фотографии, чтобы начать.'}
          {state.notice && <p className="notice">{state.notice}</p>}
        </div>
      </div>
      <section className="results-section" aria-label="Очередь фотографий">
        <div className="queue-heading"><div><h2>Ваши фотографии <span className="count">{jobs.length}</span></h2>
          <p>{bytes(jobs.reduce((n, j) => n + j.file.size, 0))} из 150 МиБ оригиналов · {bytes(stored)} из 200 МиБ результатов</p></div>
          <button disabled={busy || !results.length} onClick={() => void zip()}>{zipping ? 'Сборка ZIP…' : `Скачать ZIP${results.length ? ` (${results.length})` : ''}`}</button>
        </div>
        {jobs.length > 0 ? <>
          <div className="progress-line"><span>Обработано {processed} из {batch.length}{state.batchIds.length ? ' в партии' : ''}</span><span>Успешно {counts.done} · Ошибки {counts.error} · Отменено {counts.cancelled}</span></div>
          <progress aria-label="Прогресс обработки партии" value={processed} max={batch.length || 1} />
          <ul className="file-list">{jobs.map(job => <FileRow key={job.id} job={job} settings={settings} disabled={busy} preparing={state.preparing}
            onRemove={() => queue.remove(job.id)} onDiscard={() => queue.discardResult(job.id)} />)}</ul>
          <div className="queue-footer"><p>В ZIP войдут {results.length} из {jobs.length} файлов. Не обработано: {jobs.length - results.length}.</p>
            <button className="text-button" disabled={busy || !results.length} onClick={() => void queue.start(settings, 'all')}>Конвертировать всё заново</button></div>
        </> : <div className="empty-state"><span aria-hidden="true">▧</span><h3>Здесь появятся результаты</h3><p>Выберите файлы и нажмите «Конвертировать».<br />Предпросмотр появится после обработки.</p></div>}
        <p className="zip-status" role="status" aria-live="polite">{zipStatus}</p>
      </section>
      <aside className="privacy-note"><span aria-hidden="true">ⓘ</span><div><strong>Оригиналы остаются без изменений</strong><p>Исходные EXIF и GPS не переносятся. Один статичный результат из контейнера; сохранение HDR, глубины цвета и ICC не гарантируется. Результат может быть больше оригинала.</p></div></aside>
      <details className="help"><summary>Лимиты, сохранение и приватность</summary><div>
        <p>Лимиты: {LIMITS.files} файлов, 30 МиБ на оригинал, 150 МиБ оригиналов, 50 Мп на изображение, 200 МиБ результатов, 120 секунд на файл. Проверка разрешения выполняется после декодирования: временный пик памяти может быть значительно выше этих значений.</p>
        <p>Файлы находятся в памяти этой вкладки. После перезагрузки список пуст. ZIP дополнительно занимает память. При достижении бюджета скачайте готовое, уберите ненужные результаты и продолжите очередь.</p>
        <p>Папку для скачивания определяют настройки браузера. Очистка списка не удаляет уже скачанные файлы. Закрытие вкладки не завершает локальный сервер: остановите его клавишами Ctrl+C в окне запуска.</p>
        <p>Поддерживаются статичные HEVC/HEIC с брендом heic/heix. AVIF, видео, анимация и все кадры Live Photo не экспортируются. Отсутствие EXIF не скрывает информацию на самом изображении.</p>
        <p>Декодер: heic-to 1.6.7 / libheif 1.23.7 (LGPL). <a href="/licenses/heic-to.txt" target="_blank" rel="noreferrer">Лицензия декодера</a> · <a href="/THIRD_PARTY_NOTICES.txt" target="_blank" rel="noreferrer">Все уведомления</a>.</p>
      </div></details>
    </main>
    <footer className="page-footer"><span>Локально · Без регистрации · После установки — без интернета</span><span>JPEG / PNG</span></footer>
  </div>;
}
