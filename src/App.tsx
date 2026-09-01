import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { type ReactNode } from 'react';
import { AuthProvider, useAuth } from './lib/auth';
import { AppLayout } from './components/Layout';
import { Spinner } from './components/ui';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import CoursesPage from './pages/CoursesPage';
import CourseDetailPage from './pages/CourseDetailPage';
import GenerateWizardPage from './pages/GenerateWizardPage';
import GenerationJobsPage from './pages/GenerationJobsPage';
import QuestionBankPage from './pages/QuestionBankPage';
import QuestionDetailPage from './pages/QuestionDetailPage';
import ReviewQueuePage from './pages/ReviewQueuePage';
import ReviewDetailPage from './pages/ReviewDetailPage';
import ExamsPage from './pages/ExamsPage';
import ExamDetailPage from './pages/ExamDetailPage';
import ReportsPage from './pages/ReportsPage';
import NotificationsPage from './pages/NotificationsPage';
import SettingsPage from './pages/SettingsPage';
import ManualQuestionPage from './pages/ManualQuestionPage';
import type { UserRole } from './types';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen"><Spinner size="lg" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function RoleRoute({ children, allowed }: { children: ReactNode; allowed: UserRole[] }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen"><Spinner size="lg" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!allowed.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function PublicRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen"><Spinner size="lg" /></div>;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/courses" element={<ProtectedRoute><CoursesPage /></ProtectedRoute>} />
      <Route path="/courses/:courseId" element={<ProtectedRoute><CourseDetailPage /></ProtectedRoute>} />
      <Route path="/generate" element={<ProtectedRoute><GenerateWizardPage /></ProtectedRoute>} />
      <Route path="/generation-jobs" element={<ProtectedRoute><GenerationJobsPage /></ProtectedRoute>} />
      <Route path="/question-bank" element={<ProtectedRoute><QuestionBankPage /></ProtectedRoute>} />
      <Route path="/questions/new" element={<ProtectedRoute><ManualQuestionPage /></ProtectedRoute>} />
      <Route path="/questions/:questionId" element={<ProtectedRoute><QuestionDetailPage /></ProtectedRoute>} />
      <Route path="/review" element={<RoleRoute allowed={['reviewer', 'academic_admin', 'system_admin']}><ReviewQueuePage /></RoleRoute>} />
      <Route path="/review/:questionId" element={<RoleRoute allowed={['reviewer', 'academic_admin', 'system_admin']}><ReviewDetailPage /></RoleRoute>} />
      <Route path="/exams" element={<ProtectedRoute><ExamsPage /></ProtectedRoute>} />
      <Route path="/exams/:examId" element={<ProtectedRoute><ExamDetailPage /></ProtectedRoute>} />
      <Route path="/reports" element={<RoleRoute allowed={['academic_admin', 'system_admin']}><ReportsPage /></RoleRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      <Route path="/usage" element={<Navigate to="/settings?tab=usage" replace />} />
      <Route path="/rules" element={<Navigate to="/settings?tab=rules" replace />} />
      <Route path="/workflows" element={<Navigate to="/settings?tab=workflows" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return <AuthProvider><BrowserRouter><AppRoutes /></BrowserRouter></AuthProvider>;
}
