import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage } from '../LoginPage';
import { useAuthStore } from '../../stores';
import { api } from '../../lib/api';

jest.mock('../../stores');
jest.mock('../../lib/api');

describe('LoginPage', () => {
  const mockSetTokens = jest.fn();
  const mockSetUser = jest.fn();
  const mockNavigate = jest.fn();
  const mockLogout = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    cleanup();
    
    // Mock auth store
    (useAuthStore as jest.Mock).mockReturnValue({
      setTokens: mockSetTokens,
      setUser: mockSetUser,
      logout: mockLogout,
      user: null,
      isAuthenticated: false,
      accessToken: null,
      refreshToken: null
    });
    
    // Mock useNavigate
    jest.mock('react-router-dom', () => ({
      ...jest.requireActual('react-router-dom'),
      useNavigate: () => mockNavigate
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders login form', () => {
    render(<LoginPage />);
    
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
  });

  test('handles successful login', async () => {
    // Mock successful API response
    (api.post as jest.Mock).mockResolvedValueOnce({
      accessToken: 'test-token',
      refreshToken: 'test-refresh',
      requiresTwoFactor: false
    });
    
    (api.get as jest.Mock).mockResolvedValueOnce({
      user: { id: '1', email: 'test@example.com', name: 'Test User', role: 'USER' }
    });
    
    render(<LoginPage />);
    
    // Fill in form
    await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    
    // Submit
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    
    // Expect loading state
    expect(screen.getByRole('button')).toBeDisabled();
    
    // Wait for navigation
    await Promise.resolve();
    
    // Expect successful login flow
    expect(mockSetTokens).toHaveBeenCalledWith('test-token', 'test-refresh');
    expect(mockSetUser).toHaveBeenCalledWith({
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'USER'
    });
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  test('handles network error', async () => {
    // Mock network error
    (api.post as jest.Mock).mockRejectedValueOnce(new Error('Failed to fetch'));
    
    render(<LoginPage />);
    
    // Fill in form
    await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    
    // Submit
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    
    // Wait for error handling
    await Promise.resolve();
    
    // Expect error message
    expect(screen.getByText(/unable to connect to server/i)).toBeInTheDocument();
    expect(screen.getByText(/check your internet connection/i)).toBeInTheDocument();
    
    // Expect button to be re-enabled
    expect(screen.getByRole('button')).toBeEnabled();
  });

  test('handles invalid credentials error', async () => {
    // Mock auth error
    (api.post as jest.Mock).mockRejectedValueOnce({
      response: { status: 401 }
    });
    
    render(<LoginPage />);
    
    // Fill in form
    await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrongpassword');
    
    // Submit
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    
    // Wait for error handling
    await Promise.resolve();
    
    // Expect error message
    expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();
    
    // Expect button to be re-enabled
    expect(screen.getByRole('button')).toBeEnabled();
  });

  test('handles session expired error', async () => {
    // Mock session expired error
    (api.post as jest.Mock).mockRejectedValueOnce(new Error('Session expired'));
    
    render(<LoginPage />);
    
    // Fill in form
    await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    
    // Submit
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    
    // Wait for error handling
    await Promise.resolve();
    
    // Expect logout to be called
    expect(mockLogout).toHaveBeenCalled();
    
    // Expect error message
    expect(screen.getByText(/your session has expired/i)).toBeInTheDocument();
    
    // Expect button to be re-enabled
    expect(screen.getByRole('button')).toBeEnabled();
  });

  test('handles server error', async () => {
    // Mock server error
    (api.post as jest.Mock).mockRejectedValueOnce({
      response: { status: 500 }
    });
    
    render(<LoginPage />);
    
    // Fill in form
    await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    
    // Submit
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    
    // Wait for error handling
    await Promise.resolve();
    
    // Expect error message
    expect(screen.getByText(/server is experiencing issues/i)).toBeInTheDocument();
    
    // Expect button to be re-enabled
    expect(screen.getByRole('button')).toBeEnabled();
  });

  test('toggles password visibility', async () => {
    render(<LoginPage />);
    
    const passwordInput = screen.getByLabelText(/password/i);
    const toggleButton = screen.getByRole('button', { name: /show password/i });
    
    // Initially password should be hidden
    expect(passwordInput).toHaveAttribute('type', 'password');
    
    // Click to show password
    await userEvent.click(toggleButton);
    expect(passwordInput).toHaveAttribute('type', 'text');
    
    // Click to hide password
    await userEvent.click(toggleButton);
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('remembers me functionality', async () => {
    render(<LoginPage />);
    
    const rememberMeCheckbox = screen.getByLabelText(/remember me/i);
    
    // Initially unchecked
    expect(rememberMeCheckbox).not.toBeChecked();
    
    // Check the box
    await userEvent.click(rememberMeCheckbox);
    expect(rememberMeCheckbox).toBeChecked();
    
    // Simulate successful login
    (api.post as jest.Mock).mockResolvedValueOnce({
      accessToken: 'test-token',
      refreshToken: 'test-refresh',
      requiresTwoFactor: false
    });
    
    (api.get as jest.Mock).mockResolvedValueOnce({
      user: { id: '1', email: 'test@example.com', name: 'Test User', role: 'USER' }
    });
    
    // Fill in form and submit
    await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    
    // Wait for login
    await Promise.resolve();
    
    // Expect localStorage to have been set
    expect(localStorage.getItem('tcp_remember_me')).toBe('true');
  });
});