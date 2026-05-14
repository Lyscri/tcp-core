import { ChevronLeft, Menu } from 'lucide-react';
import { useUIStore } from '../stores';

export function SidebarToggle() {
    const { sidebarCollapsed, toggleSidebar } = useUIStore();

    return (
        <button onClick={toggleSidebar} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-surface-200/50 hover:text-white hover:bg-surface-700/50 transition-all text-sm">
            {sidebarCollapsed ? <Menu size={18} /> : <><ChevronLeft size={18} /><span>Collapse</span></>}
        </button>
    );
}