import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AuthPage from './pages/AuthPage';
import CustomerHome from './pages/customer/Home';
import CustomerActivity from './pages/customer/Activity';
import GarageDetail from './pages/customer/GarageDetail';
import CustomerSupport from './pages/customer/Support';
import CustomerProfile from './pages/customer/Profile';
import GarageOnboarding from './pages/garage/Onboarding';
import GarageDashboard from './pages/garage/Dashboard';
import GarageSettings from './pages/garage/Settings';
import GarageSupport from './pages/garage/Support';
import AdminDashboard from './pages/admin/Dashboard';
import AdminEmployees from './pages/admin/Employees';
import AdminEmployeeDetail from './pages/admin/EmployeeDetail';
import AdminReports from './pages/admin/Reports';
import AdminLayout from './pages/admin/AdminLayout';
import AdminPerformance from './pages/admin/Performance';
import AdminAdvanced from './pages/admin/Advanced';
import AdminFees from './pages/admin/Fees';
import EmployeeDashboard from './pages/employee/Dashboard';
import SupportLayout from './pages/support/SupportLayout';
import SupportChats from './pages/support/SupportChats';
import SupportChatView from './pages/support/SupportChatView';
import './index.css';

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
}

function ProtectedRoute({ children, requiredRole }: { children: React.ReactNode; requiredRole?: 'customer' | 'garage' | 'admin' | 'employee' | 'support' }) {
  const { user, userData, loading } = useAuth();


  if (loading) return <LoadingScreen />;

  if (!user) return <Navigate to="/auth" replace />;

  const savedRole = localStorage.getItem('userRole');
  const role = userData?.role || savedRole;

  if (requiredRole && role !== requiredRole) {
    // If we have a user but no role (new user), and they are trying to access a protected route,
    // we should probably let them through IF the route is for role selection, OR redirect to a role selection page.
    // For now, if role is undefined, we simply WAIT (show loading) or if we want to force role selection:
    if (!role) {
      // If role is missing, redirect to auth page for role selection
      return <Navigate to="/auth" replace />;
    }
    return <Navigate to={role === 'garage' ? '/garage' : role === 'admin' ? '/admin' : role === 'employee' ? '/employee' : role === 'support' ? '/support' : '/customer'} replace />;
  }

  return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, userData, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  if (user) {
    const savedRole = localStorage.getItem('userRole');
    const role = userData?.role || savedRole;

    // If logged in but no role, allow them to stay on AuthPage to select role
    if (!role) {
      return <>{children}</>;
    }

    if (role === 'garage') {
      const onboarded = localStorage.getItem('garageOnboarded');
      return <Navigate to={onboarded ? '/garage' : '/garage/onboarding'} replace />;
    }
    if (role === 'admin') return <Navigate to="/admin" replace />;
    if (role === 'employee') return <Navigate to="/employee" replace />;
    if (role === 'support') return <Navigate to="/support" replace />;
    return <Navigate to="/customer" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
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
      </AuthProvider>
    </BrowserRouter>
  );
}
