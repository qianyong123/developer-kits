import { Suspense } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import AppShell from '@/app/AppShell';
import { tools } from '@/app/tools';
import ErrorBoundary from '@/shared/components/ErrorBoundary/ErrorBoundary';
import { messages } from '@/shared/i18n/zh';

export default function App() {
  return (
    <HashRouter>
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
          </Routes>
        </Suspense>
      </AppShell>
    </HashRouter>
  );
}
