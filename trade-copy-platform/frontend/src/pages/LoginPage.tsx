import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores';
import { api } from '../lib/api';
import { Eye, EyeOff, ArrowRight, LucideProps } from 'lucide-react';

// Error types for better handling
type LoginError = 
  | { type: 'NETWORK_ERROR'; message: string }
  | { type: 'INVALID_CREDENTIALS'; message: string }
  | { type: 'SESSION_EXPIRED'; message: string }
  | { type: 'SERVER_ERROR'; message: string }
  | { type: 'UNKNOWN_ERROR'; message: string };

export function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [twoFactorCode, setTwoFactorCode] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [needs2FA, setNeeds2FA] = useState(false);
    const [error, setError] = useState<LoginError | null>(null);
    const [loading, setLoading] = useState(false);
    const [isRemembered, setIsRemembered] = useState(false);
    const { setTokens, setUser, logout } = useAuthStore();
    const navigate = useNavigate();
    
    // Refs for animation elements
    const emailRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);
    const formRef = useRef<HTMLFormElement>(null);
    
    // Auto-focus email field on mount
    // Load remember me preference
    useEffect(() => {
        emailRef.current?.focus();
        
        const remembered = localStorage.getItem('tcp_remember_me');
        if (remembered === 'true') {
            setIsRemembered(true);
        }
    }, []);
    
    // Helper to classify errors
    const classifyError = (error: any): LoginError => {
      if (!error) {
        return { type: 'UNKNOWN_ERROR', message: 'An unknown error occurred' };
      }
      
      // Network errors
      if (error.message?.includes('Network') || 
          error.message?.includes('fetch') || 
          error.message?.includes('failed to fetch')) {
        return { type: 'NETWORK_ERROR', message: 'Unable to connect to server. Please check your internet connection.' };
      }
      
      // HTTP status based errors
      if (error.response) {
        switch (error.response.status) {
          case 400:
          case 401:
          case 403:
            return { type: 'INVALID_CREDENTIALS', message: 'Invalid email or password. Please try again.' };
          case 408:
            return { type: 'NETWORK_ERROR', message: 'Request timeout. Please try again.' };
          case 429:
            return { type: 'NETWORK_ERROR', message: 'Too many requests. Please wait a moment and try again.' };
          case 500:
          case 502:
          case 503:
          case 504:
            return { type: 'SERVER_ERROR', message: 'Server is experiencing issues. Please try again later.' };
          default:
            return { type: 'SERVER_ERROR', message: `Server error (${error.response.status}). Please try again.` };
        }
      }
      
      // Auth specific errors from our API
      if (error.message?.includes('Invalid credentials') || 
          error.message?.includes('invalid email') || 
          error.message?.includes('invalid password')) {
        return { type: 'INVALID_CREDENTIALS', message: 'Invalid email or password. Please try again.' };
      }
      
      if (error.message?.includes('Session expired') || 
          error.message?.includes('token') || 
          error.message?.includes('authentication')) {
        return { type: 'SESSION_EXPIRED', message: 'Your session has expired. Please log in again.' };
      }
      
      // Default fallback
      return { 
        type: 'UNKNOWN_ERROR', 
        message: error.message || 'An unexpected error occurred. Please try again.' 
      };
    };
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        
        try {
            const body = await api.post<any>('/auth/login', {
                email,
                password,
                twoFactorCode: needs2FA ? twoFactorCode : undefined
            });
            
            if (body.requiresTwoFactor) {
                setNeeds2FA(true);
                return;
            }
            
            setTokens(body.accessToken, body.refreshToken);
            
            // Fetch profile
            const profileBody = await api.get<any>('/auth/me');
            if (profileBody.user) {
                setUser(profileBody.user);
            }
            
            // Save remember me preference
            if (isRemembered) {
                localStorage.setItem('tcp_remember_me', 'true');
            } else {
                localStorage.removeItem('tcp_remember_me');
            }
            
            navigate('/');
        } catch (err: any) {
            const classifiedError = classifyError(err);
            setError(classifiedError);
            
            // Handle special cases
            if (classifiedError.type === 'SESSION_EXPIRED') {
                // Clear auth state and redirect to login
                logout();
                // Stay on login page (we're already here)
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-surface-900 p-4">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-600/10 rounded-full blur-3xl" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-brand-500/5 rounded-full blur-3xl" />
            </div>

            <div className="glass-card w-full max-w-md relative animate-slide-up">
                <div className="text-center mb-8">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-bold text-xl mx-auto mb-4">TC</div>
                    <h1 className="text-2xl font-bold text-white">Welcome Back</h1>
                    <p className="text-surface-200/50 mt-1 text-sm">Sign in to your trade copy account</p>
                </div>

                 <form onSubmit={handleSubmit} className="space-y-4">
                     {error && (
                         <div 
                             className="bg-red-500/10 border border-red-500/20 px-4 py-2.5 rounded-xl text-sm flex items-center gap-3"
                             role="alert"
                         >
                             {error.type === 'NETWORK_ERROR' && <span className="flex items-center gap-2">
                                 <span className="material-icons">wifi_off</span>
                                 Connection Error
                             </span>}
                             {error.type === 'INVALID_CREDENTIALS' && <span className="flex items-center gap-2">
                                 <span className="material-icons">error</span>
                                 Invalid Credentials
                             </span>}
                             {error.type === 'SESSION_EXPIRED' && <span className="flex items-center gap-2">
                                 <span className="material-icons">logout</span>
                                 Session Expired
                             </span>}
                             {error.type === 'SERVER_ERROR' && <span className="flex items-center gap-2">
                                 <span className="material-icons">server_error</span>
                                 Server Error
                             </span>}
                             {error.type === 'UNKNOWN_ERROR' && <span className="flex items-center gap-2">
                                 <span className="material-icons">help_outline</span>
                                 Unknown Error
                             </span>}
                             <span>{error.message}</span>
                         </div>
                     )}

                    <div>
                        <label className="text-sm font-medium text-surface-200/70 mb-1.5 block">Email</label>
                        <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input w-full" placeholder="you@example.com" required />
                    </div>

                    <div>
                        <label className="text-sm font-medium text-surface-200/70 mb-1.5 block">Password</label>
                        <div className="relative">
                            <input id="login-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className="input w-full pr-10" placeholder="••••••••" required />
                            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-200/40 hover:text-white">
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    <div className="flex items-start">
                        <div className="flex items-center h-4">
                            <input id="remember-me" type="checkbox" checked={isRemembered} onChange={(e) => setIsRemembered(e.target.checked)} className="h-4 w-4 text-brand-600 focus:ring-brand-500 border-gray-300 rounded" />
                        </div>
                        <div className="ml-3 text-sm">
                            <label for="remember-me" className="text-surface-200/50">Remember me</label>
                        </div>
                    </div>

                    {needs2FA && (
                        <div className="animate-slide-up">
                            <label className="text-sm font-medium text-surface-200/70 mb-1.5 block">2FA Code</label>
                            <input id="login-2fa" type="text" value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value)} className="input w-full text-center tracking-widest font-mono" placeholder="000000" maxLength={6} required />
                        </div>
                    )}

                    <button id="login-submit" type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
                        {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><span>Sign In</span><ArrowRight size={16} /></>}
                    </button>
                </form>

                <div className="mt-6 text-center space-y-2">
                    <Link to="/register" className="text-sm text-brand-400 hover:text-brand-300 transition-colors">Don't have an account? Sign up</Link>
                </div>
            </div>
        </div>
    );
}
