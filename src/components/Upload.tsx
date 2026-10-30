import { useRef, useState } from 'react';

export function Upload({ disabled, onFiles }: { disabled: boolean; onFiles: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return <section className={`upload ${over && !disabled ? 'drag-over' : ''} ${disabled ? 'disabled' : ''}`}
    aria-label="Добавление фотографий"
    onDragOver={e => { e.preventDefault(); if (!disabled) setOver(true); }}
    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false); }}
    onDrop={e => { e.preventDefault(); setOver(false); if (!disabled) onFiles(Array.from(e.dataTransfer.files)); }}>
    <svg className="upload-icon" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M16 21V5m-6 6 6-6 6 6M6 21v5a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
    <h2>Перетащите фотографии сюда</h2>
    <p>HEIC и HEIF · до 20 файлов · до 30 МиБ каждый</p>
    <button type="button" onClick={() => input.current?.click()} disabled={disabled}>Выбрать файлы</button>
    <input ref={input} type="file" tabIndex={-1} multiple accept=".heic,.heif" aria-label="Фотографии HEIC или HEIF" className="visually-hidden"
      disabled={disabled} onChange={e => { onFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
    {disabled && <p className="upload-disabled">Добавление будет доступно после завершения операции.</p>}
  </section>;
}
