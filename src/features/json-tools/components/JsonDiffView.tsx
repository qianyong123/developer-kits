import { JsonView, defaultStyles } from 'react-json-view-lite';
import 'react-json-view-lite/dist/index.css';
import { messages } from '@/shared/i18n/zh';
import { Button } from '@/shared/components/Button/Button';
import { Tag } from '@/shared/components/Tag/Tag';
import { shortValue, type JsonChange } from '@/features/json-tools/lib/json';
import { LONG_STRING_LENGTH } from '@/features/json-tools/constants';
import styles from '@/features/json-tools/JsonToolsPage.module.css';

const CHANGE_TONE_CLASS = {
  added: styles.toneAdded,
  removed: styles.toneRemoved,
  old: styles.toneOld,
  new: styles.toneNew,
} as const;

type ChangeTone = keyof typeof CHANGE_TONE_CLASS;

function isPrimitive(value: unknown): boolean {
  return value === null || typeof value !== 'object';
}

function isLongString(value: unknown): value is string {
  return typeof value === 'string' && value.length > LONG_STRING_LENGTH;
}

/** 对比结果中的单个变更值：复杂值用可折叠 JSON 树，简单值直接展示。 */
function ChangeValue({ value, tone }: { value: unknown; tone?: ChangeTone }) {
  const toneClass = tone ? CHANGE_TONE_CLASS[tone] : '';
  if (isLongString(value)) {
    return <div className={`${styles.longString} ${toneClass}`}>{value}</div>;
  }
  if (isPrimitive(value)) {
    return (
      <span className={`${styles.changeValue} ${toneClass}`}>
        {shortValue(value, 160)}
      </span>
    );
  }
  return (
    <div className={`${styles.changeValueTree} ${toneClass}`}>
      <JsonView
        data={value as object}
        style={defaultStyles}
        shouldExpandNode={(level) => level < 1}
      />
    </div>
  );
}

interface Props {
  changes: JsonChange[];
  selected: ReadonlySet<number>;
  onToggleSelect: (index: number) => void;
  onClearSelection: () => void;
  onSelectAll: () => void;
  onCopyResult: () => void;
}

/** 对比结果视图：变更统计、全选/取消与逐条差异列表。 */
export default function JsonDiffView({
  changes,
  selected,
  onToggleSelect,
  onClearSelection,
  onSelectAll,
  onCopyResult,
}: Props) {
  const added = changes.filter((c) => c.type === 'added').length;
  const removed = changes.filter((c) => c.type === 'removed').length;
  const changed = changes.filter((c) => c.type === 'changed').length;

  return (
    <div className={styles.diffBox}>
      {changes.length === 0 ? (
        <div className={styles.diffNone}>{messages.json.diffNone}</div>
      ) : (
        <>
          <div className={styles.diffHeader}>
            <strong className={styles.diffTitle}>{messages.json.diffResultTitle}</strong>
            <span className={styles.diffStats}>
              {messages.json.diffFound(changes.length)} ·{' '}
              <Tag variant="success">
                +{added} {messages.json.changeAdded}
              </Tag>{' '}
              ·{' '}
              <Tag variant="danger">
                -{removed} {messages.json.changeRemoved}
              </Tag>{' '}
              ·{' '}
              <Tag variant="warning">
                ~{changed} {messages.json.changeChanged}
              </Tag>{' '}
              ·{' '}
              <span className={styles.diffSelectedCount}>
                {messages.json.diffSelected(selected.size)}
              </span>
            </span>
            <span className={styles.toolbarRight}>
              <Button
                variant="outline"
                size="sm"
                onClick={
                  changes.length > 0 && selected.size === changes.length
                    ? onClearSelection
                    : onSelectAll
                }
              >
                {changes.length > 0 && selected.size === changes.length
                  ? messages.json.clearSelection
                  : messages.json.selectAll}
              </Button>
              <Button variant="primary" size="sm" onClick={onCopyResult}>
                {messages.json.copyResult}
              </Button>
            </span>
          </div>
          <div className={styles.changeList}>
            {changes.map((change, i) => (
              <div
                key={i}
                className={`${styles.changeRow} ${
                  selected.has(i) ? styles.changeRowSelected : ''
                }`}
                onClick={() => onToggleSelect(i)}
              >
                <div className={styles.changeHeader}>
                  <input
                    type="checkbox"
                    className={styles.changeCheckbox}
                    checked={selected.has(i)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => onToggleSelect(i)}
                  />
                  <span className={`${styles.changeBadge} ${styles[change.type]}`}>
                    {change.type === 'added'
                      ? messages.json.changeAdded
                      : change.type === 'removed'
                        ? messages.json.changeRemoved
                        : messages.json.changeChanged}
                  </span>
                  <code className={styles.changePath}>
                    {change.path.replace(/^\$\.?/, '')}
                  </code>
                </div>
                <div
                  className={styles.changeBody}
                  onClick={(e) => {
                    // 只有点击树形折叠图标时不选中行；值区域其他位置仍可选中
                    const target = e.target as HTMLElement;
                    if (target.closest('[role="button"]')) e.stopPropagation();
                  }}
                >
                  {change.type === 'added' && (
                    <ChangeValue value={change.after} tone="added" />
                  )}
                  {change.type === 'removed' && (
                    <ChangeValue value={change.before} tone="removed" />
                  )}
                  {change.type === 'changed' &&
                    (!isLongString(change.before) &&
                    !isLongString(change.after) &&
                    isPrimitive(change.before) &&
                    isPrimitive(change.after) ? (
                      <span className={styles.changeValue}>
                        <span className={styles.toneOld}>
                          {shortValue(change.before, 120)}
                        </span>{' '}
                        →{' '}
                        <span className={styles.toneNew}>
                          {shortValue(change.after, 120)}
                        </span>
                      </span>
                    ) : (
                      <div className={styles.changePair}>
                        <div className={styles.changePairSide}>
                          <span className={styles.changeSide}>
                            {messages.json.diffOld}
                          </span>
                          <ChangeValue value={change.before} tone="old" />
                        </div>
                        <div className={styles.changePairSide}>
                          <span className={styles.changeSide}>
                            {messages.json.diffNew}
                          </span>
                          <ChangeValue value={change.after} tone="new" />
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
