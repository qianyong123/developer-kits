import { messages } from '@/shared/i18n/zh';
import { ChevronDownIcon } from '@/shared/components/Icons';
import HelpTip from '@/shared/components/HelpTip/HelpTip';
import SaveCard from '@/shared/components/SaveCard/SaveCard';
import { formatBytes, ratioPercent } from '@/shared/lib/format';
import { SVG_PRESETS } from '@/features/svg-compressor/lib/presets';
import type { SvgSettings } from '@/features/svg-compressor/lib/types';
import styles from '@/features/svg-compressor/components/SvgSettingsPanel.module.css';

interface Props {
  settings: SvgSettings;
  onChange: (settings: SvgSettings) => void;
  totals: { count: number; original: number; compressed: number };
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function SvgSettingsPanel({
  settings,
  onChange,
  totals,
  collapsed,
  onToggleCollapse,
}: Props) {
  const set = (patch: Partial<SvgSettings>) => onChange({ ...settings, ...patch });
  const activePreset = SVG_PRESETS.find((p) => p.id === settings.preset) ?? SVG_PRESETS[1];
  const saved = totals.original - totals.compressed;
  const ratio =
    totals.count > 0 && totals.original > 0
      ? ratioPercent(totals.original, totals.compressed)
      : '0%';
  const savedPct =
    totals.original > 0 ? Math.min(100, Math.max(0, (saved / totals.original) * 100)) : 0;

  return (
    <div className={styles.panel}>
      {collapsed ? (
        <div className={styles.collapsedBar}>
          <button
            type="button"
            className={styles.collapseBtn}
            onClick={onToggleCollapse}
            title={messages.svg.expandSettings}
            aria-label={messages.svg.expandSettings}
          >
            <ChevronDownIcon size={16} className={styles.unfoldIcon} />
          </button>
          <span className={styles.collapsedLabel}>{messages.svg.settings}</span>
        </div>
      ) : (
        <>
          <button
            type="button"
            className={styles.collapseHandle}
            onClick={onToggleCollapse}
            title={messages.svg.collapseSettings}
            aria-label={messages.svg.collapseSettings}
          >
            <ChevronDownIcon size={15} className={styles.foldIcon} />
          </button>

          <div className={styles.titleRow}>
            <div>
              <h3 className={styles.title}>{messages.svg.settings}</h3>
              <p className={styles.subtitle}>{messages.svg.settingsSubtitle}</p>
            </div>
          </div>

          <div className={styles.field}>
            <div className={styles.labelRow}>
              <span className={styles.label}>{messages.svg.preset}</span>
              <HelpTip text={messages.svg.settingsHelp.preset} />
            </div>
            <div className={styles.segmentRow}>
              {SVG_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={
                    p.id === settings.preset ? styles.segmentActive : styles.segment
                  }
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
            <div className={`${styles.segmentRow} ${styles.segmentRow2}`}>
              <button
                type="button"
                className={settings.format === 'svg' ? styles.segmentActive : styles.segment}
                onClick={() => set({ format: 'svg' })}
              >
                {messages.svg.formatSvg}
              </button>
              <button
                type="button"
                className={settings.format === 'svgz' ? styles.segmentActive : styles.segment}
                onClick={() => set({ format: 'svgz' })}
              >
                {messages.svg.formatSvgz}
              </button>
            </div>
          </div>

          <SaveCard
            label={messages.svg.estimatedSave}
            savedValue={formatBytes(Math.max(0, saved))}
            ratio={ratio}
            percent={savedPct}
            meta={`${messages.svg.saveRate}: ${formatBytes(totals.original)} → ${formatBytes(
              totals.compressed,
            )}`}
          />
        </>
      )}
    </div>
  );
}
