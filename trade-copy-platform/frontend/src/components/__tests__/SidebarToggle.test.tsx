import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SidebarToggle } from '../SidebarToggle';
import { useUIStore } from '../../stores';

describe('SidebarToggle', () => {
  beforeEach(() => {
    // Reset store state before each test
    useUIStore.getState().setSidebarCollapsed(false);
    useUIStore.getState().setTheme('dark');
  });

  test('renders sidebar toggle button', () => {
    render(<SidebarToggle />);
    const toggleButton = screen.getByRole('button', { name: /collapse/i });
    expect(toggleButton).toBeInTheDocument();
  });

  test('toggles sidebar collapsed state when clicked', () => {
    render(<SidebarToggle />);
    const toggleButton = screen.getByRole('button', { name: /collapse/i });
    
    // Initial state should be expanded
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
    
    // Click to collapse
    userEvent.click(toggleButton);
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);
    
    // Click again to expand
    userEvent.click(toggleButton);
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
  });
});