import { lazy, Suspense } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import AppShell from '@/app/AppShell';
import { tools } from '@/app/tools';
import PageViewTracker from '@/features/analytics/PageViewTracker';
import ErrorBoundary from '@/shared/components/ErrorBoundary/ErrorBoundary';
import { messages } from '@/shared/i18n/zh';

const AuthPage = lazy(() => import('@/features/auth/AuthPage'));
const AnalyticsPage = lazy(() => import('@/features/analytics/AnalyticsPage'));

export default function App() {
  return (
    <HashRouter>
      <PageViewTracker />
      <AppShell>
        <Suspense fallback={<div className="routeFallback">{messages.app.loading}</div>}>
          <Routes>
            {tools.map((tool) => (
              <Route
                key={tool.id}
                path={tool.path}
                element={
                  <ErrorBoundary key={tool.id}>
                    <tool.Component />
                  </ErrorBoundary>
                }
              />
            ))}
            <Route
              path="/login"
              element={
                <ErrorBoundary key="auth">
                  <AuthPage />
                </ErrorBoundary>
              }
            />
            <Route
              path="/analytics"
              element={
                <ErrorBoundary key="analytics">
                  <AnalyticsPage />
                </ErrorBoundary>
              }
            />
          </Routes>
        </Suspense>
      </AppShell>
    </HashRouter>
  );
}
