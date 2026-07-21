"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/icon";

function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/overview";
  return value;
}

function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const next = safeNext(searchParams.get("next"));
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, next }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string; redirect?: string };
      if (!response.ok) {
        const message = body.error === "too_many_attempts"
          ? "Too many attempts. Please try again later."
          : "Unable to sign in. Check your credentials and try again.";
        throw new Error(message);
      }
      router.replace(body.redirect || next);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in. Check your credentials and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand"><span className="brand-mark large"><Icon name="brain" size={26} /></span><p className="eyebrow">Secure workspace</p><h1 id="login-title">Brain Dashboard</h1><p>Agent ecosystem operations hub</p></div>
        <form onSubmit={handleSubmit} className="login-form">
          <label className="field-group" htmlFor="password"><span>Password</span><input id="password" name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" autoComplete="current-password" autoFocus required /></label>
          <div className="login-message" role="alert" aria-live="assertive">{error}</div>
          <button className="button primary full-width" type="submit" disabled={loading || !password}>{loading ? <><span className="spinner small" aria-hidden="true" />Signing in…</> : "Sign in"}</button>
        </form>
        <p className="login-footnote">Access is restricted to authorized workspace operators.</p>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<main className="login-page"><div className="spinner" role="status" aria-label="Loading sign-in form" /></main>}><LoginForm /></Suspense>;
}
