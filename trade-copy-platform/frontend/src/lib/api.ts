import { useAuthStore } from '../stores';
import { handleMockRequest } from './mockApi';

const API_BASE = '/api';
export const USE_MOCKS = true;

class ApiClient {
    private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
        if (USE_MOCKS) {
            const response = await handleMockRequest(path, options);
            if (!response.success) throw new Error('Mock request failed');
            return response.data as T;
        }

        const { accessToken } = useAuthStore.getState();

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string>),
        };

        if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

        const response = await fetch(`${API_BASE}${path}`, { ...options, headers });

        if (response.status === 401) {
            // Try refresh
            const refreshed = await this.tryRefresh();
            if (refreshed) {
                headers['Authorization'] = `Bearer ${useAuthStore.getState().accessToken}`;
                const retryResponse = await fetch(`${API_BASE}${path}`, { ...options, headers });
                return this.handleResponse<T>(retryResponse);
            }
            useAuthStore.getState().logout();
            window.location.href = '/login';
            throw new Error('Session expired');
        }

        return this.handleResponse<T>(response);
    }

    private async handleResponse<T>(response: Response): Promise<T> {
        const body = await response.json();
        if (!response.ok || !body.success) {
            throw new Error(body.error?.message ?? 'Request failed');
        }
        return body.data as T;
    }

    private async tryRefresh(): Promise<boolean> {
        const { refreshToken, setTokens } = useAuthStore.getState();
        if (!refreshToken) return false;

        try {
            const response = await fetch(`${API_BASE}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken }),
            });

            if (!response.ok) return false;
            const body = await response.json();
            if (body.success && body.data) {
                setTokens(body.data.accessToken, body.data.refreshToken);
                return true;
            }
            return false;
        } catch {
            return false;
        }
    }

    get<T>(path: string) { return this.request<T>(path); }

    post<T>(path: string, data?: unknown) {
        return this.request<T>(path, { method: 'POST', body: data ? JSON.stringify(data) : undefined });
    }

    put<T>(path: string, data?: unknown) {
        return this.request<T>(path, { method: 'PUT', body: data ? JSON.stringify(data) : undefined });
    }

    delete<T>(path: string) { return this.request<T>(path, { method: 'DELETE' }); }
}

export const api = new ApiClient();
