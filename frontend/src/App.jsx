// Route table. Every page shares the dashboard shell and the settings provider.
import { Navigate, Route, Routes } from "react-router-dom";

import { SettingsProvider } from "./context/SettingsContext";
import DashboardLayout from "./layouts/DashboardLayout";
import AnalyzePage from "./pages/AnalyzePage";
import AnalyzeVideoPage from "./pages/AnalyzeVideoPage";
import DashboardPage from "./pages/DashboardPage";
import HistoryDetailPage from "./pages/HistoryDetailPage";
import HistoryPage from "./pages/HistoryPage";
import NotFoundPage from "./pages/NotFoundPage";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  return (
    <SettingsProvider>
      <Routes>
        <Route element={<DashboardLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="analyze" element={<AnalyzePage />} />
          <Route path="analyze/video" element={<AnalyzeVideoPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="history/:id" element={<HistoryDetailPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="404" element={<NotFoundPage />} />
          {/* Unknown paths land on the in-app 404 so the sidebar stays visible. */}
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Route>
      </Routes>
    </SettingsProvider>
  );
}
