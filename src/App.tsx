import { Suspense } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import AppShell from '@/app/AppShell';
import { tools } from '@/app/tools';
import ErrorBoundary from '@/shared/components/ErrorBoundary/ErrorBoundary';

export default function App() {
  return (
    <HashRouter>
      <AppShell>
        <Suspense fallback={<div className="routeFallback">加载中…</div>}>
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
