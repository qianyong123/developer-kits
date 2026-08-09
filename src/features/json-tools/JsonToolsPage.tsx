import { messages } from '@/shared/i18n/zh';
import styles from '@/features/json-tools/JsonToolsPage.module.css';

export default function JsonToolsPage() {
  return (
    <div className={styles.page}>
      <h1>{messages.json.title}</h1>
      <p>{messages.json.comingSoon}</p>
    </div>
  );
}
