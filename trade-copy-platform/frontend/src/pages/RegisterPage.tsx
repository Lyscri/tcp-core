import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores';
import { ArrowRight, Check, LucideProps } from 'lucide-react';

export function RegisterPage() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [isRemembered, setIsRemembered] = useState(false);
    const { setTokens } = useAuthStore();
    const navigate = useNavigate();
    
    // Refs for animation elements
    const nameRef = useRef<HTMLInputElement>(null);
    const emailRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);
    const formRef = useRef<HTMLFormElement>(null);
    
    // Auto-focus name field on mount
    // Load remember me preference
    useEffect(() => {
        nameRef.current?.focus();
        
        const remembered = localStorage.getItem('tcp_remember_me');
        if (remembered === 'true') {
            setIsRemembered(true);
        }
    }, []);

    const passwordChecks = [
        { label: '8+ characters', ok: password.length >= 8 },
        { label: 'Uppercase', ok: /[A-Z]/.test(password) },
        { label: 'Lowercase', ok: /[a-z]/.test(password) },
        { label: 'Number', ok: /[0-9]/.test(password) },
        { label: 'Special char', ok: /[^A-Za-z0-9]/.test(password) },
    ];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, name }),
            });
            const body = await response.json();
            if (!body.success) { setError(body.error?.message ?? 'Registration failed'); return; }
            setTokens(body.data.accessToken, body.data.refreshToken);
            
            // Save remember me preference
            if (isRemembered) {
                localStorage.setItem('tcp_remember_me', 'true');
            } else {
                localStorage.removeItem('tcp_remember_me');
            }
            
            navigate('/');
        } catch { setError('Network error'); } finally { setLoading(false); }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-surface-900 p-4">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-brand-600/10 rounded-full blur-3xl" />
            </div>
            <div className="glass-card w-full max-w-md relative animate-slide-up">
                <div className="text-center mb-8">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-bold text-xl mx-auto mb-4">TC</div>
                    <h1 className="text-2xl font-bold text-white">Create Account</h1>
                    <p className="text-surface-200/50 mt-1 text-sm">Start copying trades in minutes</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2.5 rounded-xl text-sm">{error}</div>}
                    <div>
                        <label className="text-sm font-medium text-surface-200/70 mb-1.5 block">Name</label>
                        <input id="register-name" type="text" value={name} onChange={(e) => setName(e.target.value)} className="input w-full" placeholder="John Doe" required />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-surface-200/70 mb-1.5 block">Email</label>
                        <input id="register-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input w-full" placeholder="you@example.com" required />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-surface-200/70 mb-1.5 block">Password</label>
                        <input id="register-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input w-full" placeholder="••••••••" required />
                        <div className="flex flex-wrap gap-2 mt-2">
                            {passwordChecks.map((c) => (
                                <span key={c.label} className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${c.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-surface-700/50 text-surface-200/40'}`}>
                                    {c.ok && <Check size={10} />}{c.label}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-start">
                        <div className="flex items-center h-4">
                            <input id="remember-me-reg" type="checkbox" checked={isRemembered} onChange={(e) => setIsRemembered(e.target.checked)} className="h-4 w-4 text-brand-600 focus:ring-brand-500 border-gray-300 rounded" />
                        </div>
                        <div className="ml-3 text-sm">
                            <label for="remember-me-reg" className="text-surface-200/50">Remember me</label>
                        </div>
                    </div>
                    <button id="register-submit" type="submit" disabled={loading || !passwordChecks.every((c) => c.ok)} className="btn-primary w-full flex items-center justify-center gap-2">
                        {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><span>Create Account</span><ArrowRight size={16} /></>}
                    </button>
                </form>
                <div className="mt-6 text-center">
                    <Link to="/login" className="text-sm text-brand-400 hover:text-brand-300 transition-colors">Already have an account? Sign in</Link>
                </div>
            </div>
        </div>
    );
}
