import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { Layout } from './components/Layout.jsx';
import { Spinner } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Inbox from './pages/Inbox.jsx';
import EmailDetail from './pages/EmailDetail.jsx';
import Tasks from './pages/Tasks.jsx';

// Analytics pulls in the charting library, so it is split out of the initial
// bundle and only downloaded when the user opens that page.
const Analytics = lazy(() => import('./pages/Analytics.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));

const FullPageSpinner = () => (
  <div className="flex min-h-screen items-center justify-center bg-slate-50">
    <Spinner className="h-6 w-6 text-brand-600" />
  </div>
);

const RequireAuth = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route
      element={
        <RequireAuth>
          <Layout />
        </RequireAuth>
      }
    >
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/inbox" element={<Inbox />}>
        <Route path=":id" element={<EmailDetail />} />
      </Route>
      <Route path="/tasks" element={<Tasks />} />
      <Route
        path="/analytics"
        element={
          <Suspense fallback={<FullPageSpinner />}>
            <Analytics />
          </Suspense>
        }
      />
      <Route
        path="/settings"
        element={
          <Suspense fallback={<FullPageSpinner />}>
            <Settings />
          </Suspense>
        }
      />
    </Route>
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes>
);

export const App = () => (
  <ToastProvider>
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  </ToastProvider>
);

export default App;
