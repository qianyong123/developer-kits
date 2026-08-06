import { messages } from '../../../shared/i18n/zh';
import type { FormatOption } from '../lib/encoders';
import type { CompressSettings } from '../lib/types';
import HelpTip from './HelpTip';
import styles from './SettingsPanel.module.css';

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
          <span className={styles.label}>{messages.image.mode}</span>
          <HelpTip text={messages.image.settingsHelp.mode} />
        </div>
        <div className={styles.radios}>
          <label className={styles.radio}>
            <input
              type="radio"
              name="mode"
              checked={settings.mode === 'quality'}
              onChange={() => set({ mode: 'quality' })}
            />
            <span>{messages.image.modeQuality}</span>
          </label>
          <label className={styles.radio}>
            <input
              type="radio"
              name="mode"
              checked={settings.mode === 'target'}
              onChange={() => set({ mode: 'target' })}
            />
            <span>{messages.image.modeTarget}</span>
          </label>
        </div>
      </div>

      {settings.mode === 'quality' ? (
        <div className={styles.field}>
          <div className={styles.labelRow}>
            <span className={styles.label}>{messages.image.quality}</span>
            <HelpTip text={messages.image.settingsHelp.quality} />
          </div>
          <div className={styles.qualityRow}>
            <input
              type="range"
              min={10}
              max={100}
              value={settings.quality}
              onChange={(e) => set({ quality: Number(e.target.value) })}
            />
            <span className={styles.qualityValue}>{settings.quality}</span>
          </div>
        </div>
      ) : (
        <div className={styles.field}>
          <div className={styles.labelRow}>
            <label className={styles.label} htmlFor="target-kb">
              {messages.image.targetSize} ({messages.image.targetUnit})
            </label>
            <HelpTip text={messages.image.settingsHelp.targetSize} />
          </div>
          <input
            id="target-kb"
            type="number"
            min={1}
            max={10240}
            value={settings.targetKB}
            onChange={(e) => set({ targetKB: Math.max(1, Number(e.target.value) || 1) })}
          />
        </div>
      )}

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
