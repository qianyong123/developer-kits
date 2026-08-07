import { messages } from '../../../shared/i18n/zh';
import type { FormatOption } from '../lib/encoders';
import type { CompressSettings } from '../lib/types';
import HelpTip from './HelpTip';
import styles from './SettingsPanel.module.css';

/** 质量预设档位：极致 / 高保真（默认） / 均衡 / 小体积 */
const QUALITY_PRESETS: Array<{ value: number; label: string }> = [
  { value: 95, label: '极致' },
  { value: 80, label: '高保真' },
  { value: 65, label: '标准' },
  { value: 40, label: '紧凑' },
];
/** 压缩比例预设档位：压缩后体积不超过原图的对应比例（原图 = 不主动缩小，仅保证不超过原图） */
const RATIO_PRESETS: Array<{ value: number; label: string }> = [
  { value: 100, label: '原图' },
  { value: 70, label: '70%' },
  { value: 50, label: '50%' },
  { value: 20, label: '20%' },
];

interface Props {
  settings: CompressSettings;
  onChange: (settings: CompressSettings) => void;
}

export default function SettingsPanel({ settings, onChange }: Props) {
  const set = (patch: Partial<CompressSettings>) => onChange({ ...settings, ...patch });

  return (
    <div className={styles.panel}>
      <h3 className={styles.title}>{messages.image.settings}</h3>

      <div className={styles.field}>
        <div className={styles.labelRow}>
          <span className={styles.label}>{messages.image.quality}</span>
          <HelpTip text={messages.image.settingsHelp.quality} />
        </div>
        <div className={styles.qualityRow}>
          {QUALITY_PRESETS.map((q) => (
            <button
              key={q.value}
              type="button"
              className={
                q.value === settings.quality ? styles.presetBtnActive : styles.presetBtn
              }
              onClick={() => set({ quality: q.value })}
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.field}>
        <div className={styles.labelRow}>
          <span className={styles.label}>{messages.image.compressRatio}</span>
          <HelpTip text={messages.image.settingsHelp.compressRatio} />
        </div>
        <div className={styles.qualityRow}>
          {RATIO_PRESETS.map((r) => (
            <button
              key={r.value}
              type="button"
              className={
                r.value === settings.compressRatio ? styles.presetBtnActive : styles.presetBtn
              }
              onClick={() => set({ compressRatio: r.value })}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.field}>
        <div className={styles.labelRow}>
          <label className={styles.label} htmlFor="format">
            {messages.image.format}
          </label>
          <HelpTip text={messages.image.settingsHelp.format} />
        </div>
        <select
          id="format"
          value={settings.format}
          onChange={(e) => set({ format: e.target.value as FormatOption })}
        >
          <option value="original">{messages.image.formatOriginal}</option>
          <option value="webp">WebP</option>
          <option value="jpeg">JPEG</option>
          <option value="png">PNG</option>
        </select>
      </div>

      <div className={styles.checkRow}>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={settings.keepMetadata}
            onChange={(e) => set({ keepMetadata: e.target.checked })}
          />
          <span>{messages.image.keepMetadata}</span>
        </label>
        <HelpTip text={messages.image.settingsHelp.keepMetadata} />
      </div>
      {settings.keepMetadata && settings.format !== 'jpeg' && (
        <div className={styles.hint}>
          {settings.format === 'original'
            ? messages.image.keepMetadataHintOriginal
            : messages.image.keepMetadataHint}
        </div>
      )}

      <div className={styles.field}>
        <div className={styles.labelRow}>
          <label className={styles.label} htmlFor="max-edge">
            {messages.image.maxEdge}
          </label>
          <HelpTip text={messages.image.settingsHelp.maxEdge} />
        </div>
        <input
          id="max-edge"
          type="number"
          min={0}
          step={64}
          value={settings.maxEdge}
          onChange={(e) => set({ maxEdge: Math.max(0, Number(e.target.value) || 0) })}
        />
        <span className={styles.hint}>{messages.image.maxEdgeHint}</span>
      </div>
    </div>
  );
}
