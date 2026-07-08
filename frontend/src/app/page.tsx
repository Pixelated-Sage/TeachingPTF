'use client';

// frontend/src/app/page.tsx
// Comprehensive registration, OTP verification, and login workflow.
//
// DESIGN AESTHETICS:
// Premium dark-slate theme with glassmorphism card layouts, subtle indigo/violet
// gradient backdrops, and active micro-animations.

import { useState } from 'react';

type AuthMode = 'login' | 'register' | 'verify';

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login');
  
  // Registration / Login Inputs
  const [name, setName] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  
  // OTP Verification Inputs
  const [otpCode, setOtpCode] = useState('');
  const [verifyEmail, setVerifyEmail] = useState('');
  
  // Local testing ease
  const [testOtpNotice, setTestOtpNotice] = useState('');

  // Status handlers
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !rollNumber || !email || !password) {
      setError('Please fill in all required fields.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`${backendUrl}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, rollNumber, email, phone, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed.');

      setSuccess('Registration successful! Enter the OTP code sent to verification console.');
      setVerifyEmail(email);
      
      // Save test code state for easy copy-paste in local dev
      if (data.testOtpCode) {
        setTestOtpNotice(data.testOtpCode);
      }
      
      setMode('verify');
    } catch (err: any) {
      setError(err.message || 'Server connection error.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode) {
      setError('OTP Code is required.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`${backendUrl}/api/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verifyEmail, otpCode }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed.');

      setSuccess('Email successfully verified. You can now log in.');
      setTestOtpNotice('');
      setMode('login');
    } catch (err: any) {
      setError(err.message || 'Verification error.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Email and password are required.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`${backendUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed.');

      // Store student profiles + session tokens in localStorage
      localStorage.setItem('student', JSON.stringify({
        id: data.id,
        name: data.name,
        rollNumber: data.rollNumber,
        email: data.email,
        sessionToken: data.sessionToken,
      }));

      // Redirect to the new student Dashboard view
      window.location.href = '/dashboard';
    } catch (err: any) {
      setError(err.message || 'Authentication error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-slate-950 font-sans overflow-hidden">
      {/* Background decoration orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-violet-900/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-indigo-900/20 blur-[120px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md p-8 bg-slate-900/60 border border-slate-800 rounded-2xl shadow-2xl backdrop-blur-xl transition-all duration-300 hover:border-violet-500/20">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center mb-3 shadow-lg shadow-violet-500/20">
            <span className="text-white font-extrabold text-xl tracking-wider">L</span>
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-violet-200 to-indigo-200 bg-clip-text text-transparent">
            Live Classroom Platform
          </h1>
          <p className="text-slate-400 text-xs mt-1 text-center">
            {mode === 'login' && 'Sign in to access your joined classrooms'}
            {mode === 'register' && 'Create your new student profile'}
            {mode === 'verify' && `Verify OTP sent to verification console`}
          </p>
        </div>

        {/* Tab switch headers (hidden during OTP verify step) */}
        {mode !== 'verify' && (
          <div className="flex border-b border-slate-800 mb-6">
            <button
              onClick={() => {
                setMode('login');
                setError('');
                setSuccess('');
              }}
              className={`flex-1 pb-3 text-sm font-semibold tracking-wider transition-colors ${
                mode === 'login' ? 'border-b-2 border-violet-500 text-slate-100' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setMode('register');
                setError('');
                setSuccess('');
              }}
              className={`flex-1 pb-3 text-sm font-semibold tracking-wider transition-colors ${
                mode === 'register' ? 'border-b-2 border-violet-500 text-slate-100' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Register
            </button>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs text-center">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs text-center">
            {success}
          </div>
        )}

        {testOtpNotice && (
          <div className="mb-4 p-3 rounded-lg bg-violet-500/10 border border-violet-500/25 text-violet-300 text-xs text-center font-mono select-all">
            Test verification code: <span className="font-bold">{testOtpNotice}</span>
          </div>
        )}

        {/* Mode Forms */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. abhishek@domain.com"
                className="w-full px-4 py-3 bg-slate-950/60 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 bg-slate-950/60 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-medium rounded-lg shadow-lg shadow-violet-500/10 transition-all duration-200 disabled:opacity-50 active:scale-[0.98]"
            >
              {loading ? 'Authenticating...' : 'Enter Platform'}
            </button>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">Full Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Abhishek Kumar"
                className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">Admission Roll Number *</label>
              <input
                type="text"
                required
                value={rollNumber}
                onChange={(e) => setRollNumber(e.target.value)}
                placeholder="CS202604"
                className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">Email Address *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="abhishek@domain.com"
                className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">Phone Number (Optional)</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 99999 99999"
                className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">Secure Password *</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-medium rounded-lg shadow-lg shadow-violet-500/10 transition-all duration-200 disabled:opacity-50 active:scale-[0.98]"
            >
              {loading ? 'Creating Account...' : 'Register Profile'}
            </button>
          </form>
        )}

        {mode === 'verify' && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">
                Enter 6-Digit OTP code sent to console
              </label>
              <input
                type="text"
                required
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                placeholder="123456"
                className="w-full px-4 py-3 bg-slate-950/60 border border-slate-800 rounded-lg text-slate-200 text-center tracking-widest font-mono text-lg focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-medium rounded-lg shadow-lg shadow-violet-500/10 transition-all duration-200 disabled:opacity-50 active:scale-[0.98]"
            >
              {loading ? 'Verifying OTP...' : 'Verify & Continue'}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError('');
                setSuccess('');
                setTestOtpNotice('');
              }}
              className="w-full text-center text-xs text-slate-400 hover:text-slate-200 pt-2 transition-colors"
            >
              Cancel and Go Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
