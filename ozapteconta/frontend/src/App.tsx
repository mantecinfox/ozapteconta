import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Users from "@/pages/Users";
import Clients from "@/pages/Clients";
import AdminLogs from "@/pages/AdminLogs";
import AdminWhatsappAccounts from "@/pages/AdminWhatsappAccounts";
import BotTraining from "@/pages/BotTraining";
import AiUsage from "@/pages/AiUsage";
import Settings from "@/pages/Settings";
import ClientSignup from "@/pages/ClientSignup";
import ClientQr from "@/pages/ClientQr";
import ClientLogin from "@/pages/ClientLogin";
import ClientDashboard from "@/pages/ClientDashboard";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 animate-pulse" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "CLIENT") return <Navigate to="/cliente/painel" replace />;

  return <DashboardLayout>{children}</DashboardLayout>;
}

function ClientProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/cliente/login" replace />;
  if (user.role !== "CLIENT") return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/cliente" element={<ClientSignup />} />
      <Route path="/cliente/qr/:token" element={<ClientQr />} />
      <Route path="/cliente/login" element={user ? <Navigate to={user.role === "CLIENT" ? "/cliente/painel" : "/"} replace /> : <ClientLogin />} />
      <Route path="/cliente/painel" element={<ClientProtectedRoute><ClientDashboard /></ClientProtectedRoute>} />
      <Route path="/login" element={user ? <Navigate to={user.role === "CLIENT" ? "/cliente/painel" : "/"} replace /> : <Login />} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/users" element={<ProtectedRoute><Users /></ProtectedRoute>} />
      <Route path="/clients" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
      <Route path="/admin-logs" element={<ProtectedRoute><AdminLogs /></ProtectedRoute>} />
      <Route path="/whatsapp-accounts" element={<ProtectedRoute><AdminWhatsappAccounts /></ProtectedRoute>} />
      <Route path="/bot-training" element={<ProtectedRoute><BotTraining /></ProtectedRoute>} />
      <Route path="/ai-usage" element={<ProtectedRoute><AiUsage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
