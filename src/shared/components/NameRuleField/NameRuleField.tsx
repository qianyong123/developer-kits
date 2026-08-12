import { messages } from '@/shared/i18n/zh';
import HelpTip from '@/shared/components/HelpTip/HelpTip';
import styles from './NameRuleField.module.css';

interface Props {
  /** 输入框 id 前缀（label htmlFor 使用），同页多个实例时避免冲突 */
  idPrefix: string;
  value: { prefix: string; suffix: string };
  onChange: (next: { prefix: string; suffix: string }) => void;
}

/**
 * 文件名规则输入：前缀 + 后缀，供图片 / SVG 压缩等输出命名共用。
 * 文案为公共文案（messages.app.*），各模块保持一致。
 */
export default function NameRuleField({ idPrefix, value, onChange }: Props) {
  const prefixId = `${idPrefix}-name-prefix`;
  const suffixId = `${idPrefix}-name-suffix`;

  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <span className={styles.label}>{messages.app.nameRule}</span>
        <HelpTip text={messages.app.nameRuleHelp} />
      </div>
      <div className={styles.nameRuleRow}>
        <div className={styles.nameInputWrap}>
          <label className={styles.label} htmlFor={prefixId}>
            {messages.app.namePrefix}
          </label>
          <input
            id={prefixId}
            type="text"
            maxLength={32}
            placeholder={messages.app.namePrefixPlaceholder}
            value={value.prefix}
            onChange={(e) => onChange({ ...value, prefix: e.target.value })}
          />
        </div>
        <div className={styles.nameInputWrap}>
          <label className={styles.label} htmlFor={suffixId}>
            {messages.app.nameSuffix}
          </label>
          <input
            id={suffixId}
            type="text"
            maxLength={32}
            placeholder={messages.app.nameSuffixPlaceholder}
            value={value.suffix}
            onChange={(e) => onChange({ ...value, suffix: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
