import type { ReactNode } from 'react';
import styles from '@/shared/components/Tag/Tag.module.css';

export type TagVariant = 'default' | 'success' | 'danger' | 'warning';

export interface TagProps {
  variant?: TagVariant;
  className?: string;
  children: ReactNode;
}

/** 公共标签：彩色圆角小标签，用于统计/状态标识。 */
export function Tag({ variant = 'default', className, children }: TagProps) {
  return (
    <span className={`${styles.tag} ${styles[variant]}${className ? ` ${className}` : ''}`}>
      {children}
    </span>
  );
}
