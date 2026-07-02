'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { API_URL } from '@/lib/config';

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  };
};

export default function LoginPage() {
  const router = useRouter();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState('JOB_SEEKER');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isRegister ? '/auth/register' : '/auth/login';
      const body = isRegister
        ? { email, password, firstName, lastName, role }
        : { email, password };

      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || `Request failed (${res.status})`);
      }

      const data: LoginResponse = await res.json();
      localStorage.setItem('beleqet_token', data.accessToken);
      localStorage.setItem('beleqet_refresh', data.refreshToken);
      localStorage.setItem('beleqet_user', JSON.stringify(data.user));
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-border bg-white p-8">
          <h1 className="text-2xl font-extrabold text-ink text-center">
            {isRegister ? 'Create an Account' : 'Welcome Back'}
          </h1>
          <p className="text-sm text-muted text-center mt-1">
            {isRegister ? 'Join Beleqet and find your next opportunity' : 'Sign in to your Beleqet account'}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="text-sm font-medium text-ink">Email</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border px-4 py-2.5 text-sm text-ink placeholder:text-muted outline-none focus:border-brandGreen transition-colors"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="text-sm font-medium text-ink">Password</label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border px-4 py-2.5 text-sm text-ink placeholder:text-muted outline-none focus:border-brandGreen transition-colors"
                placeholder="••••••••"
              />
            </div>

            {isRegister && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="firstName" className="text-sm font-medium text-ink">First Name</label>
                    <input
                      id="firstName"
                      type="text"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-border px-4 py-2.5 text-sm text-ink placeholder:text-muted outline-none focus:border-brandGreen transition-colors"
                      placeholder="John"
                    />
                  </div>
                  <div>
                    <label htmlFor="lastName" className="text-sm font-medium text-ink">Last Name</label>
                    <input
                      id="lastName"
                      type="text"
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-border px-4 py-2.5 text-sm text-ink placeholder:text-muted outline-none focus:border-brandGreen transition-colors"
                      placeholder="Doe"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="role" className="text-sm font-medium text-ink">I am a</label>
                  <select
                    id="role"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border px-4 py-2.5 text-sm text-ink outline-none focus:border-brandGreen transition-colors"
                  >
                    <option value="JOB_SEEKER">Job Seeker</option>
                    <option value="FREELANCER">Freelancer</option>
                    <option value="EMPLOYER">Employer</option>
                  </select>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-brandGreen text-white text-sm font-semibold py-3 hover:bg-darkGreen transition-colors disabled:opacity-50"
            >
              {loading ? 'Please wait…' : isRegister ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-muted">
            {isRegister ? (
              <>Already have an account?{' '}
                <button onClick={() => { setIsRegister(false); setError(''); }} className="text-brandGreen font-semibold hover:underline">
                  Sign in
                </button>
              </>
            ) : (
              <>Don't have an account?{' '}
                <button onClick={() => { setIsRegister(true); setError(''); }} className="text-brandGreen font-semibold hover:underline">
                  Create one
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
