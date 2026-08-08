import { messages } from '../../../shared/i18n/zh';
import { ArrowRightIcon, ChevronDownIcon } from '../../../shared/components/Icons';
import HelpTip from '../../../shared/components/HelpTip/HelpTip';
import { formatBytes, ratioPercent } from '../../../shared/lib/format';
import type { FormatOption } from '../lib/encoders';
import type { CompressSettings } from '../lib/types';
import styles from './SettingsPanel.module.css';

/** 质量预设档位：极致 / 高保真（默认）/ 均衡 / 小体积 */
const QUALITY_PRESETS: Array<{ value: number; label: string }> = [
  { value: 95, label: '极致' },
  { value: 80, label: '高保真' },
  { value: 65, label: '标准' },
  { value: 40, label: '紧凑' },
];
/** 压缩比例预设档位：压缩后体积不超过原图的对应比例（原图 = 不主动缩小，仅保证不超过原图）*/
const RATIO_PRESETS: Array<{ value: number; label: string }> = [
  { value: 100, label: '原图' },
  { value: 70, label: '70%' },
  { value: 50, label: '50%' },
  { value: 20, label: '20%' },
];
/** 输出格式预设 */
const FORMAT_PRESETS: Array<{ value: FormatOption; label: string }> = [
  { value: 'original', label: '原格式' },
  { value: 'webp', label: 'WebP' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'png', label: 'PNG' },
];

interface Props {
  settings: CompressSettings;
  onChange: (settings: CompressSettings) => void;
  onReset: () => void;
  onCompress: () => void;
  pendingCount: number;
  totals: { count: number; original: number; compressed: number };
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function SettingsPanel({
  settings,
  onChange,
  onReset,
  onCompress,
  pendingCount,
  totals,
  collapsed,
  onToggleCollapse,
}: Props) {
  const set = (patch: Partial<CompressSettings>) => onChange({ ...settings, ...patch });

  const saved = totals.original - totals.compressed;
  const ratio =
    totals.count > 0 && totals.original > 0
      ? ratioPercent(totals.original, totals.compressed)
      : '0%';
  const savedPct =
    totals.original > 0 ? Math.min(100, Math.max(0, (saved / totals.original) * 100)) : 0;

  return (
    <div className={styles.panel}>
      <div className={styles.titleRow}>
        <div>
          <h3 className={styles.title}>{messages.image.settings}</h3>
          {!collapsed && <p className={styles.subtitle}>{messages.image.settingsSubtitle}</p>}
        </div>
        <div className={styles.titleActions}>
          <button type="button" className={styles.resetBtn} onClick={onReset}>
            {messages.image.reset}
          </button>
          <button
            type="button"
            className={`${styles.collapseBtn} ${collapsed ? styles.collapsed : ''}`}
            onClick={onToggleCollapse}
            title={collapsed ? messages.image.expandSettings : messages.image.collapseSettings}
            aria-label={collapsed ? messages.image.expandSettings : messages.image.collapseSettings}
            aria-expanded={!collapsed}
          >
            <ChevronDownIcon size={15} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <div className={styles.field}>
            <div className={styles.labelRow}>
              <span className={styles.label}>{messages.image.quality}</span>
              <HelpTip text={messages.image.settingsHelp.quality} />
            </div>
            <div className={styles.segmentRow}>
              {QUALITY_PRESETS.map((q) => (
                <button
                  key={q.value}
                  type="button"
                  className={
                    q.value === settings.quality ? styles.segmentActive : styles.segment
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
            <div className={styles.segmentRow}>
              {RATIO_PRESETS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  className={
                    r.value === settings.compressRatio ? styles.segmentActive : styles.segment
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
              <span className={styles.label}>{messages.image.format}</span>
              <HelpTip text={messages.image.settingsHelp.format} />
            </div>
            <div className={styles.segmentRow}>
              {FORMAT_PRESETS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  className={
                    f.value === settings.format ? styles.segmentActive : styles.segment
                  }
                  onClick={() => set({ format: f.value })}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <div className={styles.switchRow}>
              <div>
                <div className={styles.labelRow}>
                  <span className={styles.label}>{messages.image.keepMetadata}</span>
                  <HelpTip text={messages.image.settingsHelp.keepMetadata} />
                </div>
                <div className={styles.fieldDesc}>{messages.image.keepMetadataDesc}</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.keepMetadata}
                className={`${styles.switch} ${settings.keepMetadata ? styles.switchOn : ''}`}
                onClick={() => set({ keepMetadata: !settings.keepMetadata })}
              >
                <span className={styles.knob} />
              </button>
            </div>
            {settings.keepMetadata && settings.format !== 'jpeg' && (
              <div className={styles.hint}>
                {settings.format === 'original'
                  ? messages.image.keepMetadataHintOriginal
                  : messages.image.keepMetadataHint}
              </div>
            )}
          </div>

          <div className={styles.field}>
            <div className={styles.labelRow}>
              <label className={styles.label} htmlFor="max-edge">
                {messages.image.maxEdge}
              </label>
              <span className={styles.edgeHint}>{messages.image.maxEdgeHint}</span>
            </div>
            <div className={styles.inputWrap}>
              <input
                id="max-edge"
                type="number"
                min={0}
                step={64}
                placeholder={messages.image.maxEdgePlaceholder}
                value={settings.maxEdge}
                onChange={(e) => set({ maxEdge: Math.max(0, Number(e.target.value) || 0) })}
              />
              <span className={styles.inputUnit}>px</span>
            </div>
          </div>

          <div className={styles.saveCard}>
            <div className={styles.saveHeader}>
              <span className={styles.saveLabel}>{messages.image.estimatedSave}</span>
              <strong className={styles.saveValue}>{formatBytes(Math.max(0, saved))}</strong>
              <strong className={styles.saveRatio}>{ratio}</strong>
            </div>
            <div className={styles.saveBar}>
              <div className={styles.saveFill} style={{ width: `${savedPct}%` }} />
            </div>
            <div className={styles.saveMeta}>
              {messages.image.saveRate}: {formatBytes(totals.original)} →{' '}
              {formatBytes(totals.compressed)}
            </div>
          </div>

          <button
            type="button"
            className={styles.compressBtn}
            disabled={pendingCount === 0}
            onClick={onCompress}
          >
            {messages.image.compressNow(pendingCount)}
            <ArrowRightIcon size={16} />
          </button>
        </>
      )}
    </div>
  );
}
