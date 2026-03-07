import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/layout/Layout";
import DashboardPage from "./pages/DashboardPage";
import ConfigPage from "./pages/ConfigPage";
import DocumentsPage from "./pages/DocumentsPage";
import DesignPage from "./pages/DesignPage";
import { ToastProvider } from "./components/shared";

export default function App() {
  return (
    <>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/design" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/config" element={<ConfigPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/design" element={<DesignPage />} />
        </Routes>
      </Layout>
      <ToastProvider />
    </>
  );
}
