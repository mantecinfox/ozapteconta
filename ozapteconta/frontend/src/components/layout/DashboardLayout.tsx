import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Settings, Users,
  LogOut, Menu, X, BotMessageSquare, MessageSquare, ChevronRight,
  Sun, Moon, Monitor, ScrollText, BarChart3,
} from "lucide-react";
import { cn } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme, type Theme } from "@/contexts/ThemeContext";

const navItems = [
  { path: "/", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/users", icon: Users, label: "Usuários" },
  { path: "/clients", icon: Users, label: "Clientes" },
  { path: "/admin-logs", icon: ScrollText, label: "Logs" },
  { path: "/ai-usage", icon: BarChart3, label: "Uso de IA" },
  { path: "/whatsapp-accounts", icon: MessageSquare, label: "Contas WPP" },
  { path: "/bot-training", icon: BotMessageSquare, label: "Treinamento Bot" },
  { path: "/settings", icon: Settings, label: "Configurações" },
];

const THEMES: { value: Theme; icon: React.ElementType; label: string }[] = [
  { value: "dark",   icon: Moon,    label: "Escuro"  },
  { value: "light",  icon: Sun,     label: "Claro"   },
  { value: "hybrid", icon: Monitor, label: "Híbrido" },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  // No modo híbrido a sidebar usa variáveis próprias (escuras)
  const isHybrid = theme === "hybrid";

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        style={isHybrid ? {
          background: "hsl(var(--sidebar-bg))",
          borderColor: "hsl(var(--sidebar-border))",
          color: "hsl(var(--sidebar-fg))",
        } : undefined}
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-30 w-64 flex flex-col",
          "bg-card border-r border-border/50 transition-transform duration-300",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div
          style={isHybrid ? { borderColor: "hsl(var(--sidebar-border))" } : undefined}
          className="flex items-center gap-3 px-5 py-5 border-b border-border/50"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <BotMessageSquare className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 style={isHybrid ? { color: "hsl(var(--sidebar-fg))" } : undefined}
                className="text-sm font-bold text-foreground">ozapteconta</h1>
            <p style={isHybrid ? { color: "hsl(var(--sidebar-muted))" } : undefined}
               className="text-xs text-muted-foreground">Dashboard Admin</p>
          </div>
          <button
            style={isHybrid ? { color: "hsl(var(--sidebar-muted))" } : undefined}
            className="ml-auto lg:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = location.pathname === item.path ||
              (item.path !== "/" && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={cn("sidebar-item", active && "active")}
                style={isHybrid && !active ? {
                  color: "hsl(var(--sidebar-muted))",
                } : isHybrid && active ? {
                  color: "hsl(var(--primary))",
                  backgroundColor: "hsl(var(--primary) / 0.15)",
                } : undefined}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
                {active && <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-60" />}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div
          style={isHybrid ? { borderColor: "hsl(var(--sidebar-border))" } : undefined}
          className="p-3 border-t border-border/50"
        >
          <div
            style={isHybrid ? { background: "hsl(var(--sidebar-accent) / 0.5)" } : undefined}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-secondary/50"
          >
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-xs font-bold text-primary uppercase">
                {user?.username?.[0] || "A"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p style={isHybrid ? { color: "hsl(var(--sidebar-fg))" } : undefined}
                 className="text-xs font-medium text-foreground truncate">{user?.username}</p>
              <p style={isHybrid ? { color: "hsl(var(--sidebar-muted))" } : undefined}
                 className="text-xs text-muted-foreground capitalize">{user?.role?.toLowerCase()}</p>
            </div>
            <button
              onClick={logout}
              style={isHybrid ? { color: "hsl(var(--sidebar-muted))" } : undefined}
              className="text-muted-foreground hover:text-destructive transition-colors"
              title="Sair"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center gap-4 px-6 py-4 border-b border-border/50 bg-card/50 backdrop-blur-sm">
          <button
            className="lg:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-foreground">
              {navItems.find((n) => n.path === location.pathname)?.label ||
               navItems.find((n) => n.path !== "/" && location.pathname.startsWith(n.path))?.label ||
               "Dashboard"}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {/* Theme switcher */}
            <div className="flex items-center gap-0.5 p-1 rounded-lg bg-secondary border border-border/50">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTheme(t.value)}
                  title={t.label}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all",
                    theme === t.value
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <t.icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t.label}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success/10 border border-success/20">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              <span className="text-xs text-success font-medium">Online</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
