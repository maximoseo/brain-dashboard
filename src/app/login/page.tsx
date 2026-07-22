"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/icon";

function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/overview";
  return value;
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
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
      const payload: Record<string, string> = { password, next };
      if (email.trim()) payload.email = email.trim();
      if (totpCode) payload.totp_code = totpCode;

      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({})) as { error?: string; redirect?: string };

      if (response.status === 403 && body.error === "mfa_required") {
        setMfaRequired(true);
        setLoading(false);
        return;
      }

      if (!response.ok) {
        const message = body.error === "too_many_attempts"
          ? "Too many attempts. Please try again later."
          : body.error === "invalid_mfa_code"
          ? "Invalid verification code. Try again."
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
        <div className="login-brand">
          <span className="brand-mark large"><Icon name="brain" size={26} /></span>
          <p className="eyebrow">Secure workspace</p>
          <h1 id="login-title">Brain Dashboard</h1>
          <p>Agent ecosystem operations hub</p>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          <label className="field-group" htmlFor="email">
            <span>Email</span>
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@maximo-seo.com"
              autoComplete="email"
              autoFocus
              dir="ltr"
            />
          </label>
          <label className="field-group" htmlFor="password">
            <span>Password</span>
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
              dir="ltr"
            />
          </label>
          {mfaRequired && (
            <label className="field-group" htmlFor="totp">
              <span>Verification code</span>
              <input
                id="totp"
                name="totp"
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                autoComplete="one-time-code"
                autoFocus
                dir="ltr"
                style={{ letterSpacing: "0.3em", textAlign: "center" }}
              />
            </label>
          )}
          <div className="login-message" role="alert" aria-live="assertive">{error}</div>
          <button className="button primary full-width" type="submit" disabled={loading || !password}>
            {loading ? <><span className="spinner small" aria-hidden="true" />{mfaRequired ? "Verifying…" : "Signing in…"}</> : mfaRequired ? "Verify" : "Sign in"}
          </button>
        </form>
        <p className="login-footnote">Access is restricted to authorized workspace operators.</p>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<main className="login-page"><div className="spinner" role="status" aria-label="Loading sign-in form" /></main>}><LoginForm /></Suspense>;
}
