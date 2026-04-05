import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import BugsList from './pages/BugsList';
import NewBug from './pages/NewBug';
import BugDetail from './pages/BugDetail';
import BatchEvaluation from './pages/BatchEvaluation';
import Analytics from './pages/Analytics';
import TestSuites from './pages/TestSuites';
import About from './pages/About';
import Account from './pages/Account';
import Login from './pages/Login';
import Register from './pages/Register';
import FloatingEvalTracker from './components/FloatingEvalTracker';
import { useAuth } from './contexts/AuthContext';

function ProtectedLayout() {
  const { ready, token } = useAuth();
  if (!ready) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400 text-sm">
        Loading…
      </div>
    );
  }
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <Outlet />
        </div>
      </main>
      <FloatingEvalTracker />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/bugs" element={<BugsList />} />
        <Route path="/bugs/new" element={<NewBug />} />
        <Route path="/bugs/:id" element={<BugDetail />} />
        <Route path="/batch" element={<BatchEvaluation />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/test-suites" element={<TestSuites />} />
        <Route path="/account" element={<Account />} />
        <Route path="/about" element={<About />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
