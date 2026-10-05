import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AuthPage from './pages/AuthPage';

// Each role's screens load on demand: a customer never downloads the admin
// console, and first paint of the login screen stays small.
const CustomerHome = lazy(() => import('./pages/customer/Home'));
const CustomerActivity = lazy(() => import('./pages/customer/Activity'));
const GarageDetail = lazy(() => import('./pages/customer/GarageDetail'));
const CustomerSupport = lazy(() => import('./pages/customer/Support'));
const CustomerProfile = lazy(() => import('./pages/customer/Profile'));
const GarageOnboarding = lazy(() => import('./pages/garage/Onboarding'));
const GarageDashboard = lazy(() => import('./pages/garage/Dashboard'));
const GarageSettings = lazy(() => import('./pages/garage/Settings'));
const GarageSupport = lazy(() => import('./pages/garage/Support'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const AdminEmployees = lazy(() => import('./pages/admin/Employees'));
const AdminEmployeeDetail = lazy(() => import('./pages/admin/EmployeeDetail'));
const AdminReports = lazy(() => import('./pages/admin/Reports'));
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const AdminPerformance = lazy(() => import('./pages/admin/Performance'));
const AdminAdvanced = lazy(() => import('./pages/admin/Advanced'));
const AdminFees = lazy(() => import('./pages/admin/Fees'));
const EmployeeDashboard = lazy(() => import('./pages/employee/Dashboard'));
const SupportLayout = lazy(() => import('./pages/support/SupportLayout'));
const SupportChats = lazy(() => import('./pages/support/SupportChats'));
const SupportChatView = lazy(() => import('./pages/support/SupportChatView'));
import './index.css';

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[var(--app-bg)] flex items-center justify-center" role="status" aria-label="Loading">
      <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
}

type Role = 'customer' | 'garage' | 'admin' | 'employee' | 'support';

function homeForRole(role: string): string {
  if (role === 'garage') return localStorage.getItem('garageOnboarded') ? '/garage' : '/garage/onboarding';
  if (role === 'admin' || role === 'employee' || role === 'support') return `/${role}`;
  return '/customer';
}

function ProtectedRoute({ children, requiredRole }: { children: React.ReactNode; requiredRole?: Role }) {
  const { user, userData, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  if (!user) return <Navigate to="/auth" replace />;

  const savedRole = localStorage.getItem('userRole');
  const role = userData?.role || savedRole;

  if (requiredRole && role !== requiredRole) {
    // Signed in but no role yet (new user) -> finish role selection on /auth.
    return <Navigate to={role ? homeForRole(role) : '/auth'} replace />;
  }

  return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, userData, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  if (user) {
    const savedRole = localStorage.getItem('userRole');
    const role = userData?.role || savedRole;

    // Logged in but no role yet: stay here to pick one.
    if (!role) return <>{children}</>;
    return <Navigate to={homeForRole(role)} replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/" element={<Navigate to="/auth" replace />} />
          <Route path="/auth" element={<AuthRoute><AuthPage /></AuthRoute>} />

          {/* Customer Routes */}
          <Route path="/customer" element={<ProtectedRoute requiredRole="customer"><CustomerHome /></ProtectedRoute>} />
          <Route path="/customer/activity" element={<ProtectedRoute requiredRole="customer"><CustomerActivity /></ProtectedRoute>} />
          <Route path="/customer/garage/:id" element={<ProtectedRoute requiredRole="customer"><GarageDetail /></ProtectedRoute>} />
          <Route path="/customer/support" element={<ProtectedRoute requiredRole="customer"><CustomerSupport /></ProtectedRoute>} />
          <Route path="/customer/profile" element={<ProtectedRoute requiredRole="customer"><CustomerProfile /></ProtectedRoute>} />

          {/* Garage Routes */}
          <Route path="/garage/onboarding" element={<ProtectedRoute requiredRole="garage"><GarageOnboarding /></ProtectedRoute>} />
          <Route path="/garage" element={<ProtectedRoute requiredRole="garage"><GarageDashboard /></ProtectedRoute>} />
          <Route path="/garage/dashboard" element={<ProtectedRoute requiredRole="garage"><GarageDashboard /></ProtectedRoute>} />
          <Route path="/garage/settings" element={<ProtectedRoute requiredRole="garage"><GarageSettings /></ProtectedRoute>} />
          <Route path="/garage/support" element={<ProtectedRoute requiredRole="garage"><GarageSupport /></ProtectedRoute>} />

          {/* Admin Routes (Nested in Layout) */}
          <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><AdminLayout /></ProtectedRoute>}>
            <Route index element={<AdminDashboard />} />
            <Route path="employees" element={<AdminEmployees />} />
            <Route path="employees/:id" element={<AdminEmployeeDetail />} />
            <Route path="performance" element={<AdminPerformance />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="fees" element={<AdminFees />} />
            <Route path="advanced" element={<AdminAdvanced />} />
          </Route>

          {/* Employee Routes */}
          <Route path="/employee" element={<ProtectedRoute requiredRole="employee"><EmployeeDashboard /></ProtectedRoute>} />

          {/* Customer Support Routes (Nested in Layout) */}
          <Route path="/support" element={<ProtectedRoute requiredRole="support"><SupportLayout /></ProtectedRoute>}>
            <Route index element={<SupportChats />} />
            <Route path="chat/:ticketId" element={<SupportChatView />} />
            <Route path="reports" element={<AdminReports />} />
          </Route>

          <Route path="*" element={<Navigate to="/auth" replace />} />
        </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
