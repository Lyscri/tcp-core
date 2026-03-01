import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores';
import { api } from '../lib/api';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';

export function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [twoFactorCode, setTwoFactorCode] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [needs2FA, setNeeds2FA] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { setTokens, setUser } = useAuthStore();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
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

            navigate('/');
        } catch (err: any) {
            setError(err.message || 'Login failed');
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
                    {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2.5 rounded-xl text-sm">{error}</div>}

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
