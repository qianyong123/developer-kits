import type { ButtonHTMLAttributes } from 'react';
import styles from '@/shared/components/Button/Button.module.css';

export type ButtonVariant = 'default' | 'primary' | 'outline' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/** 公共按钮：default（中性）/ primary（主色）/ outline（描边）/ danger（危险）。 */
export function Button({
  variant = 'default',
  size = 'md',
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${styles.button} ${styles[variant]} ${styles[size]}${
        className ? ` ${className}` : ''
      }`}
      {...rest}
    >
      {children}
    </button>
  );
}
