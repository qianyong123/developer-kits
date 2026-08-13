import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/shared/components/Button/Button';
import Notice from '@/shared/components/Notice/Notice';
import { messages } from '@/shared/i18n/zh';
import { formatCreatedAt } from '@/features/auth/lib/formatDate';
import { useAuthStore } from '@/features/auth/store';
import type { AuthActionResult } from '@/features/auth/types';
import styles from '@/features/auth/AuthPage.module.css';

type FormMode = 'login' | 'register';

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

export default function AuthPage() {
  const { status, user, initialize, login, register, signOut } = useAuthStore();
  const [mode, setMode] = useState<FormMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) {
      return;
    }
    if (!USERNAME_PATTERN.test(username)) {
      setError(messages.auth.usernameInvalid);
      return;
    }
    if (password.length < 8) {
      setError(messages.auth.passwordTooShort);
      return;
    }

    setSubmitting(true);
    setError(null);
    const result: AuthActionResult =
      mode === 'login' ? await login(username, password) : await register(username, password);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setPassword('');
  };

  if (status === 'checking') {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <p className={styles.checking}>{messages.auth.checking}</p>
        </div>
      </div>
    );
  }

  if (status === 'authenticated' && user) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h1>{messages.auth.title}</h1>
          <div className={styles.userInfo}>
            <span className={styles.userName}>{messages.auth.hello(user.username)}</span>
            <dl className={styles.userMeta}>
              <div>
                <dt>{messages.auth.uidLabel}</dt>
                <dd>{user.uid}</dd>
              </div>
              <div>
                <dt>{messages.auth.createdAtLabel}</dt>
                <dd>{formatCreatedAt(user.createdAt)}</dd>
              </div>
            </dl>
          </div>
          <Button variant="outline" className={styles.submit} onClick={signOut}>
            {messages.auth.signOut}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1>{messages.auth.title}</h1>

        <div className={styles.tabs} role="tablist" aria-label={messages.auth.title}>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={mode === 'login' ? styles.tabActive : styles.tab}
            onClick={() => setMode('login')}
          >
            {messages.auth.loginTab}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={mode === 'register' ? styles.tabActive : styles.tab}
            onClick={() => setMode('register')}
          >
            {messages.auth.registerTab}
          </button>
        </div>

        {error && <Notice text={error} onClose={() => setError(null)} />}

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span>{messages.auth.usernameLabel}</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder={messages.auth.usernamePlaceholder}
              autoComplete="username"
              minLength={3}
              maxLength={20}
              required
            />
          </label>
          <label className={styles.field}>
            <span>{messages.auth.passwordLabel}</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={messages.auth.passwordPlaceholder}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={8}
              maxLength={72}
              required
            />
          </label>
          <Button type="submit" variant="primary" className={styles.submit} disabled={submitting}>
            {submitting
              ? messages.auth.submitting
              : mode === 'login'
                ? messages.auth.loginSubmit
                : messages.auth.registerSubmit}
          </Button>
        </form>
      </div>
    </div>
  );
}
