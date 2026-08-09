import { Suspense } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import AppShell from '@/app/AppShell';
import { tools } from '@/app/tools';

export default function App() {
  return (
    <HashRouter>
      <AppShell>
        <Suspense fallback={<div className="routeFallback">加载中…</div>}>
          <Routes>
            {tools.map((tool) => (
              <Route key={tool.id} path={tool.path} element={<tool.Component />} />
            ))}
          </Routes>
        </Suspense>
      </AppShell>
    </HashRouter>
  );
}
