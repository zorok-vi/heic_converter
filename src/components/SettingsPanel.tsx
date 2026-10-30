import type { Settings } from '../conversion/types';

export function SettingsPanel({ value, disabled, onChange }: { value: Settings; disabled: boolean; onChange: (settings: Settings) => void }) {
  return <section className="settings-panel" aria-label="Параметры конвертации">
    <fieldset disabled={disabled}>
      <legend>Формат результата</legend>
      <div className="format-switch">
        {(['jpeg', 'png'] as const).map(format => <label key={format} className={value.format === format ? 'selected' : ''}>
          <input type="radio" name="format" value={format} checked={value.format === format} onChange={() => onChange({ ...value, format })} />
          <span>{format.toUpperCase()}</span>
        </label>)}
      </div>
    </fieldset>
    <div className="quality-field">
      {value.format === 'jpeg' ? <>
        <label htmlFor="quality">Качество JPEG <output htmlFor="quality">{value.quality}%</output></label>
        <input id="quality" type="range" min="10" max="100" step="1" value={value.quality} disabled={disabled} onChange={e => onChange({ ...value, quality: Number(e.target.value) })} />
        <p>90% — исходная настройка. Размер результата зависит от фотографии.</p>
      </> : <p className="png-note"><strong>PNG сохраняет прозрачность</strong><br />Настройка качества JPEG к PNG не применяется.</p>}
    </div>
  </section>;
}
