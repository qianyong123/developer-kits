import { useEffect, useRef, type ReactNode } from 'react';
import styles from '@/shared/components/Checkbox/Checkbox.module.css';

export interface CheckboxProps {
  /** 是否勾选（受控） */
  checked: boolean;
  /** 状态变化回调，参数为最新勾选值 */
  onChange: (checked: boolean) => void;
  /** 半选态（不确定状态），仅作视觉展示 */
  indeterminate?: boolean;
  /** 可选文字标签；不传时仅渲染复选框 */
  label?: ReactNode;
  /** 无可见标签时提供无障碍名称 */
  ariaLabel?: string;
  disabled?: boolean;
  name?: string;
  title?: string;
  /** 叠加到外层 label 的类名（页面级间距/字号等） */
  className?: string;
  /** 叠加到复选框输入框的类名 */
  inputClassName?: string;
}

/** 公共复选框：受控组件，支持半选态与可选文字标签。 */
export function Checkbox({
  checked,
  onChange,
  indeterminate = false,
  label,
  ariaLabel,
  disabled = false,
  name,
  title,
  className,
  inputClassName,
}: CheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // 半选态只能通过 DOM 属性设置，React 没有对应的受控属性
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <label
      className={`${styles.checkbox}${disabled ? ` ${styles.disabled}` : ''}${
        className ? ` ${className}` : ''
      }`}
      title={title}
    >
      <input
        ref={inputRef}
        type="checkbox"
        className={`${styles.input}${inputClassName ? ` ${inputClassName}` : ''}`}
        checked={checked}
        disabled={disabled}
        name={name}
        aria-label={label == null ? ariaLabel : undefined}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label != null && <span className={styles.label}>{label}</span>}
    </label>
  );
}
