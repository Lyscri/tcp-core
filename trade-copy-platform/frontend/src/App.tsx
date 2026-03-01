import { Routes, Route, Navigate } from 'react-router-dom';

import { DashboardLayout } from './components/DashboardLayout';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { AccountsPage } from './pages/AccountsPage';
import { SyncConfigPage } from './pages/SyncConfigPage';
import { RiskPage } from './pages/RiskPage';
import { LiveMonitorPage } from './pages/LiveMonitorPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { SubscriptionPage } from './pages/SubscriptionPage';
import { AdminPage } from './pages/AdminPage';

import { useAuthStore } from './stores';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { isAuthenticated } = useAuthStore();
    if (!isAuthenticated) return <Navigate to="/login" replace />;
    return <>{children}</>;
}

export default function App() {
    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/" element={
                <ProtectedRoute>
                    <DashboardLayout />
                </ProtectedRoute>
            }>
                <Route index element={<DashboardPage />} />
                <Route path="accounts" element={<AccountsPage />} />
                <Route path="sync" element={<SyncConfigPage />} />
                <Route path="risk" element={<RiskPage />} />
                <Route path="monitor" element={<LiveMonitorPage />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="subscription" element={<SubscriptionPage />} />
                <Route path="admin" element={<AdminPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}
