import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore, useUIStore } from '../stores';
import { useWebSocket } from '../hooks/useWebSocket';
import { LayoutDashboard, Users, Link2, Shield, Activity, BarChart3, CreditCard, Settings, LogOut, ChevronLeft, Wifi, WifiOff, Menu, Sun, Moon } from 'lucide-react';
import clsx from 'clsx';

const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
    { to: '/accounts', icon: Users, label: 'Accounts' },
    { to: '/sync', icon: Link2, label: 'Sync Config' },
    { to: '/risk', icon: Shield, label: 'Risk Control' },
    { to: '/monitor', icon: Activity, label: 'Live Monitor' },
    { to: '/analytics', icon: BarChart3, label: 'Analytics' },
    { to: '/subscription', icon: CreditCard, label: 'Subscription' },
    { to: '/admin', icon: Settings, label: 'Admin' },
];

export function DashboardLayout() {
    const { user, logout } = useAuthStore();
    const { sidebarCollapsed, toggleSidebar, theme, toggleTheme } = useUIStore();
    const { connected } = useWebSocket();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div className="flex h-screen overflow-hidden">
            {/* Sidebar */}
            <aside className={clsx(
                'flex flex-col bg-surface-800/80 backdrop-blur-xl border-r border-surface-700/50 transition-all duration-300',
                sidebarCollapsed ? 'w-[72px]' : 'w-64'
            )}>
                {/* Logo */}
                <div className="flex items-center gap-3 px-5 py-5 border-b border-surface-700/50">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        TC
                    </div>
                    {!sidebarCollapsed && (
                        <span className="text-sm font-semibold text-white truncate">Trade Copy</span>
                    )}
                </div>

                {/* Nav */}
                <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.end}
                            className={({ isActive }) => clsx(
                                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                                isActive
                                    ? 'bg-brand-600/20 text-brand-400 shadow-sm'
                                    : 'text-surface-200/70 hover:text-white hover:bg-surface-700/50'
                            )}
                        >
                            <item.icon size={20} className="flex-shrink-0" />
                            {!sidebarCollapsed && <span>{item.label}</span>}
                        </NavLink>
                    ))}
                </nav>

                {/* Footer */}
                <div className="px-3 py-4 border-t border-surface-700/50 space-y-2">
                    <div className={clsx("flex items-center gap-2 px-3 py-1", sidebarCollapsed && "justify-center")}>
                        {connected ? <Wifi size={14} className="text-emerald-400" /> : <WifiOff size={14} className="text-red-400" />}
                        {!sidebarCollapsed && <span className="text-xs text-surface-200/50">{connected ? 'Live' : 'Offline'}</span>}
                    </div>
                    <button onClick={toggleTheme} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-surface-200/50 hover:text-white hover:bg-surface-700/50 transition-all text-sm">
                        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                        {!sidebarCollapsed && <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
                    </button>
                    <button onClick={toggleSidebar} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-surface-200/50 hover:text-white hover:bg-surface-700/50 transition-all text-sm">
                        {sidebarCollapsed ? <Menu size={18} /> : <><ChevronLeft size={18} /><span>Collapse</span></>}
                    </button>
                    <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-all text-sm">
                        <LogOut size={18} />
                        {!sidebarCollapsed && <span>Logout</span>}
                    </button>
                </div>
            </aside>

            {/* Main */}
            <main className="flex-1 overflow-y-auto">
                <header className="sticky top-0 z-10 bg-surface-900/80 backdrop-blur-xl border-b border-surface-700/50 px-8 py-4">
                    <div className="flex items-center justify-between">
                        <h1 className="text-lg font-semibold text-white">Welcome back, {user?.name ?? 'Trader'}</h1>
                        <div className="flex items-center gap-3">
                            <div className={clsx("w-2 h-2 rounded-full", connected ? "bg-emerald-400 animate-pulse-slow" : "bg-red-400")} />
                            <span className="text-xs text-surface-200/50 font-mono">
                                {new Date().toLocaleTimeString()}
                            </span>
                        </div>
                    </div>
                </header>
                <div className="p-8 animate-fade-in">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}

