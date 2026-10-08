'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../lib/auth/AuthContext';
import { Palette, ArrowRight, ShieldCheck, Cpu, Code2, Lock, Users } from 'lucide-react';

export default function Home() {
  const { user, token, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && token) {
      router.push('/dashboard');
    }
  }, [isLoading, token, router]);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between p-6 sm:p-12 font-sans">
      <div className="max-w-4xl mx-auto w-full space-y-12 my-auto">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
            Phase 6 — Authentication & Role-Based Access Control
          </div>

          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-white">
            Real-Time Collaborative Whiteboard
          </h1>

          <p className="text-lg text-slate-400 max-w-2xl leading-relaxed">
            A production-ready vector whiteboard with WebSocket synchronization, Redis Pub/Sub scaling, PostgreSQL persistence, and JWT Authentication.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-slate-800/60 border border-slate-800 space-y-2">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 w-fit text-indigo-400">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-base text-slate-200">JWT Authentication</h3>
            <p className="text-xs text-slate-400 leading-normal">
              Secure password hashing with bcrypt, JWT token validation, and user profile management.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-800/60 border border-slate-800 space-y-2">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 w-fit text-emerald-400">
              <Users className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-base text-slate-200">Role-Based Access</h3>
            <p className="text-xs text-slate-400 leading-normal">
              Granular Owner, Editor, and Read-Only Viewer permissions enforced server-side.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-800/60 border border-slate-800 space-y-2">
            <div className="p-2.5 rounded-xl bg-amber-500/10 w-fit text-amber-400">
              <Code2 className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-base text-slate-200">Persistent Board State</h3>
            <p className="text-xs text-slate-400 leading-normal">
              Durable PostgreSQL storage with Prisma ORM and multi-instance Redis Pub/Sub sync.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 pt-4">
          <Link
            href="/login"
            className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-white shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition group"
          >
            Sign In to Dashboard
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition" />
          </Link>
          <Link
            href="/signup"
            className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 font-semibold text-slate-200 border border-slate-700 flex items-center justify-center gap-2 transition"
          >
            Create Account
          </Link>
        </div>
      </div>

      <footer className="text-center text-xs text-slate-600 font-mono py-4 border-t border-slate-800/60">
        Phase 6 Full Monorepo • Next.js + NestJS + PostgreSQL + Redis Pub/Sub + JWT
      </footer>
    </div>
  );
}
