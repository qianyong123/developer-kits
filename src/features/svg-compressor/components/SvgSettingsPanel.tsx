import { messages } from '../../../shared/i18n/zh';
import HelpTip from '../../../shared/components/HelpTip/HelpTip';
import { SVG_PRESETS } from '../lib/presets';
import type { SvgSettings } from '../lib/types';
import styles from './SvgSettingsPanel.module.css';

interface Props {
  settings: SvgSettings;
  onChange: (settings: SvgSettings) => void;
}

export default function SvgSettingsPanel({ settings, onChange }: Props) {
  const set = (patch: Partial<SvgSettings>) => onChange({ ...settings, ...patch });
  const activePreset = SVG_PRESETS.find((p) => p.id === settings.preset) ?? SVG_PRESETS[1];

  return (
    <div className={styles.panel}>
      <h3 className={styles.title}>{messages.svg.settings}</h3>

      <div className={styles.field}>
        <div className={styles.labelRow}>
          <span className={styles.label}>{messages.svg.preset}</span>
          <HelpTip text={messages.svg.settingsHelp.preset} />
        </div>
        <div className={styles.qualityRow}>
          {SVG_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={p.id === settings.preset ? styles.presetBtnActive : styles.presetBtn}
              onClick={() => set({ preset: p.id })}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className={styles.hint}>{activePreset.hint}</div>
      </div>

      <div className={styles.field}>
        <div className={styles.labelRow}>
          <span className={styles.label}>{messages.svg.format}</span>
          <HelpTip text={messages.svg.settingsHelp.format} />
        </div>
        <div className={styles.qualityRow}>
          <button
            type="button"
            className={settings.format === 'svg' ? styles.presetBtnActive : styles.presetBtn}
            onClick={() => set({ format: 'svg' })}
          >
            {messages.svg.formatSvg}
          </button>
          <button
            type="button"
            className={settings.format === 'svgz' ? styles.presetBtnActive : styles.presetBtn}
            onClick={() => set({ format: 'svgz' })}
          >
            {messages.svg.formatSvgz}
          </button>
        </div>
      </div>
    </div>
  );
}
