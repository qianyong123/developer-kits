import { HashRouter, Route, Routes } from 'react-router-dom';
import AppShell from '@/app/AppShell';
import ImageCompressorPage from '@/features/image-compressor/ImageCompressorPage';
import JsonToolsPage from '@/features/json-tools/JsonToolsPage';
import SvgCompressorPage from '@/features/svg-compressor/SvgCompressorPage';

export default function App() {
  return (
    <HashRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<ImageCompressorPage />} />
          <Route path="/svg" element={<SvgCompressorPage />} />
          <Route path="/json" element={<JsonToolsPage />} />
        </Routes>
      </AppShell>
    </HashRouter>
  );
}
