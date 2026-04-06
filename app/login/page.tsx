"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Mail, Lock, Eye, EyeOff } from "lucide-react";
import Button from "@/components/ui/button";
import { useAppData } from "@/components/providers/AppDataProvider";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAppData();
  const [formState, setFormState] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await login(formState.email, formState.password);
      router.replace("/dashboard");
    } catch (loginError) {
      const message = loginError instanceof Error ? loginError.message : "Unable to login.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
          <ShieldCheck size={24} />
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.4em] text-slate-500">Team Task Manager</p>
          <h1 className="text-2xl font-semibold text-slate-900">Welcome back</h1>
        </div>
      </div>

      <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="email" className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            Email
          </label>
          <div className="mt-2 flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <Mail size={16} className="text-slate-400" />
            <input
              id="email"
              type="email"
              className="ml-3 w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              placeholder="admin@test.com"
              value={formState.email}
              onChange={(event) => setFormState((prev) => ({ ...prev, email: event.target.value }))}
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            Password
          </label>
          <div className="mt-2 flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
            <Lock size={16} className="text-slate-400" />
            <div className="relative ml-3 w-full">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              className="w-full bg-transparent pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              placeholder="••••••••"
              value={formState.password}
              onChange={(event) => setFormState((prev) => ({ ...prev, password: event.target.value }))}
              required
            />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 transition hover:text-gray-700"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-400">Use any password to access the demo.</p>
        </div>

        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

        <Button type="submit" className="w-full rounded-2xl py-3 text-sm" disabled={isSubmitting}>
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <div className="mt-8 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
        <p className="font-semibold uppercase tracking-[0.3em] text-slate-400">Need an account?</p>
        <p className="mt-2 text-slate-500">
          Use your Supabase credentials to sign in. Contact an admin to be granted access if needed.
        </p>
      </div>
    </div>
  );
}
