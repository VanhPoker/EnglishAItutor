import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { bootstrapAuth } from "./lib/api";
import { useAuthStore } from "./stores/authStore";
import { useUserStore } from "./stores/userStore";
import Home from "./pages/Home";
import Practice from "./pages/Practice";
import Dashboard from "./pages/Dashboard";
import AdminDashboard from "./pages/AdminDashboard";
import AdminPayments from "./pages/AdminPayments";
import AdminUsers from "./pages/AdminUsers";
import Billing from "./pages/Billing";
import Review from "./pages/Review";
import QuizResult from "./pages/QuizResult";
import LearnerQuizzes from "./pages/LearnerQuizzes";
import QuizStudio from "./pages/QuizStudio";
import QuizTake from "./pages/QuizTake";
import Login from "./pages/Login";
import LandingPage from "./pages/LandingPage";

function FullScreenLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="flex items-center gap-3 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Đang khôi phục phiên đăng nhập...
      </div>
    </div>
  );
}

function homePathForRole(user: ReturnType<typeof useAuthStore.getState>["user"]) {
  return user?.role === "admin" ? "/admin" : "/";
}

function LearnerRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isBootstrapped = useAuthStore((s) => s.isBootstrapped);
  const user = useAuthStore((s) => s.user);

  if (!isBootstrapped) return <FullScreenLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role === "admin") return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isBootstrapped = useAuthStore((s) => s.isBootstrapped);
  const user = useAuthStore((s) => s.user);

  if (!isBootstrapped) return <FullScreenLoader />;
  if (isAuthenticated) return <Navigate to={homePathForRole(user)} replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isBootstrapped = useAuthStore((s) => s.isBootstrapped);
  const user = useAuthStore((s) => s.user);

  if (!isBootstrapped) return <FullScreenLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== "admin") return <Navigate to="/" replace />;
  return <>{children}</>;
}

function RoleRedirect() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isBootstrapped = useAuthStore((s) => s.isBootstrapped);
  const user = useAuthStore((s) => s.user);

  if (!isBootstrapped) return <FullScreenLoader />;
  return <Navigate to={isAuthenticated ? homePathForRole(user) : "/login"} replace />;
}

function RootRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isBootstrapped = useAuthStore((s) => s.isBootstrapped);
  const user = useAuthStore((s) => s.user);

  if (!isBootstrapped) return <FullScreenLoader />;
  if (!isAuthenticated) return <LandingPage />;
  if (user?.role === "admin") return <Navigate to="/admin" replace />;
  return <Home />;
}

export default function App() {
  const user = useAuthStore((s) => s.user);
  const setUser = useUserStore((s) => s.setUser);
  const setLevel = useUserStore((s) => s.setLevel);

  useEffect(() => {
    void bootstrapAuth();
  }, []);

  useEffect(() => {
    if (!user) return;
    setUser(user.id, user.name);
    setLevel(user.cefr_level);
  }, [setLevel, setUser, user]);

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <GuestRoute>
            <Login />
          </GuestRoute>
        }
      />
      <Route
        path="/"
        element={<RootRoute />}
      />
      <Route
        path="/practice"
        element={
          <LearnerRoute>
            <Practice />
          </LearnerRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <LearnerRoute>
            <Dashboard />
          </LearnerRoute>
        }
      />
      <Route
        path="/billing"
        element={
          <LearnerRoute>
            <Billing />
          </LearnerRoute>
        }
      />
      <Route
        path="/review"
        element={
          <LearnerRoute>
            <Review />
          </LearnerRoute>
        }
      />
      <Route
        path="/review/:sessionId"
        element={
          <LearnerRoute>
            <Review />
          </LearnerRoute>
        }
      />
      <Route
        path="/quizzes"
        element={
          <LearnerRoute>
            <LearnerQuizzes />
          </LearnerRoute>
        }
      />
      <Route
        path="/quizzes/:quizId"
        element={
          <LearnerRoute>
            <QuizTake />
          </LearnerRoute>
        }
      />
      <Route
        path="/quiz-results/:attemptId"
        element={
          <LearnerRoute>
            <QuizResult />
          </LearnerRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminDashboard />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/users"
        element={
          <AdminRoute>
            <AdminUsers />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/payments"
        element={
          <AdminRoute>
            <AdminPayments />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/quizzes"
        element={
          <AdminRoute>
            <QuizStudio />
          </AdminRoute>
        }
      />
      <Route path="*" element={<RoleRedirect />} />
    </Routes>
  );
}
