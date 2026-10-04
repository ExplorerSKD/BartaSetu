import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import OverviewPage from './pages/OverviewPage';
import UsersPage from './pages/UsersPage';
import DevicesPage from './pages/DevicesPage';
import MessagesPage from './pages/MessagesPage';
import SOSAlertsPage from './pages/SOSAlertsPage';
import MeshTopologyPage from './pages/MeshTopologyPage';

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="devices" element={<DevicesPage />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="sos-alerts" element={<SOSAlertsPage />} />
          <Route path="mesh-topology" element={<MeshTopologyPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
