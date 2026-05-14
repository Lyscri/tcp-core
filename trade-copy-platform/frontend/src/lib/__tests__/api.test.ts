import { api } from '../api';
import { useAuthStore } from '../stores';
import { handleMockRequest } from './mockApi';

// Mock the auth store
jest.mock('../stores', () => ({
  useAuthStore: {
    getState: jest.fn(),
    subscribe: jest.fn()
  }
}));

// Mock the mockApi
jest.mock('./mockApi', () => ({
  handleMockRequest: jest.fn()
}));

describe('ApiClient', () => {
  const mockPath = '/test-endpoint';
  const mockData = { id: 1, name: 'Test' };
  const mockError = { message: 'Test error' };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock auth store state
    (useAuthStore.getState as jest.Mock).mockReturnValue({
      accessToken: 'test-token',
      refreshToken: 'test-refresh-token',
      setTokens: jest.fn(),
      logout: jest.fn(),
      user: null,
      isAuthenticated: true
    });
  });

  describe('GET requests', () => {
    test('should handle successful GET request', async () => {
      (handleMockRequest as jest.Mock).mockResolvedValue({
        success: true,
        data: mockData
      });

      const result = await api.get<typeof mockData>(mockPath);
      
      expect(handleMockRequest).toHaveBeenCalledWith(mockPath, expect.objectContaining({
        method: 'GET'
      }));
      expect(result).toEqual(mockData);
    });

    test('should handle API error responses', async () => {
      (handleMockRequest as jest.Mock).mockResolvedValue({
        success: false,
        error: mockError
      });

      await expect(api.get(mockPath)).rejects.toThrow('Test error');
      expect(handleMockRequest).toHaveBeenCalled();
    });

    test('should handle network errors', async () => {
      (handleMockRequest as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(api.get(mockPath)).rejects.toThrow('Network error');
    });
  });

  describe('POST requests', () => {
    test('should handle successful POST request', async () => {
      (handleMockRequest as jest.Mock).mockResolvedValue({
        success: true,
        data: mockData
      });

      const result = await api.post<typeof mockData>(mockPath, { test: 'data' });
      
      expect(handleMockRequest).toHaveBeenCalledWith(mockPath, expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ test: 'data' })
      }));
      expect(result).toEqual(mockData);
    });
  });

  describe('Authentication handling', () => {
    test('should add authorization header when token exists', async () => {
      (handleMockRequest as jest.Mock).mockResolvedValue({
        success: true,
        data: mockData
      });

      await api.get(mockPath);
      
      // Check that headers contain authorization
      expect(handleMockRequest).toHaveBeenCalledWith(mockPath, expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token'
        })
      }));
    });

    test('should handle 401 and attempt token refresh', async () => {
      // First call returns 401
      (handleMockRequest as jest.Mock)
        .mockRejectedValueOnce({ status: 401 }) // Initial failed request
        .mockResolvedValueOnce({ // Refresh token response
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: {
              accessToken: 'new-token',
              refreshToken: 'new-refresh'
            }
          })
        })
        .mockResolvedValueOnce({ // Retry original request with new token
          success: true,
          data: mockData
        });

      // Mock auth state updates
      (useAuthStore.getState as jest.Mock)
        .mockReturnValueOnce({
          accessToken: 'test-token',
          refreshToken: 'test-refresh-token',
          setTokens: jest.fn(),
          logout: jest.fn(),
          user: null,
          isAuthenticated: true
        })
        .mockReturnValueOnce({
          accessToken: 'new-token',
          refreshToken: 'new-refresh-token',
          setTokens: jest.fn(),
          logout: jest.fn(),
          user: null,
          isAuthenticated: true
        });

      const result = await api.get<typeof mockData>(mockPath);
      
      expect(result).toEqual(mockData);
      expect(useAuthStore.getState().setTokens).toHaveBeenCalledWith(
        'new-token',
        'new-refresh-token'
      );
    });

    test('should redirect to login when refresh fails', async () => {
      // Mock failed refresh
      (handleMockRequest as jest.Mock)
        .mockRejectedValueOnce({ status: 401 }) // Initial failed request
        .mockResolvedValueOnce({ // Failed refresh
          ok: false
        });

      // Mock auth state
      (useAuthStore.getState as jest.Mock).mockReturnValue({
        accessToken: 'test-token',
        refreshToken: 'test-refresh-token',
        setTokens: jest.fn(),
        logout: jest.fn(),
        user: null,
        isAuthenticated: true
      });

      // Mock window.location
      const locationHrefSetter = jest.fn();
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { href: '', assign: jest.fn() }
      });

      await expect(api.get(mockPath)).rejects.toThrow('Session expired');
      
      expect(useAuthStore.getState().logout).toHaveBeenCalled();
      // Note: Testing window.location assignment is tricky in jsdom
    });
  });
});