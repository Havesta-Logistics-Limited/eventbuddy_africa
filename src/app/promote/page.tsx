"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { AuthCentered, AuthSplit } from "@/components/auth/auth-shell";
import { CheckEmailPanel } from "@/components/auth/check-email-panel";
import { isValidEmail, isValidPhoneStrict, sanitizePhoneInput } from "@/lib/validation";

/* Promoter sign-up (migration 0105): the organizer sign-up form with a public
 * handle in place of the organization name. */

// useSearchParams needs a Suspense boundary so the rest of the page can still be
// prerendered; the form itself renders immediately inside it.
export default function PromoterSignupPage() {
  return (
    <Suspense>
      <PromoterSignupForm />
    </Suspense>
  );
}

function PromoterSignupForm() {
  const prefillEmail = useSearchParams().get("email") ?? "";
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [handle, setHandle] = useState("");
  const [email, setEmail] = useState(prefillEmail);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [emailSent, setEmailSent] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!isValidPhoneStrict(phone)) {
      setError("Enter a valid phone number, e.g. 0801 234 5678 or +234 801 234 5678.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/promoters/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, handle, email, phone, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't create your account.");
        setLoading(false);
        return;
      }
      setEmailSent(data.emailSent !== false);
      setSubmittedEmail(email);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setLoading(false);
    }
  };

  if (submittedEmail) {
    return (
      <AuthCentered>
        <CheckEmailPanel email={submittedEmail} emailSent={emailSent} onBack={() => router.push("/login?as=promoter")} />
      </AuthCentered>
    );
  }

  const fieldClass = "eb-input";
  const labelClass = "eb-label";

  return (
    <AuthSplit
      headline="Share events you love."
      accent="Get paid for it."
      sub="Pick events from the marketplace, share your own link, and earn a commission on every ticket sold through it."
    >

          <h1 className="eb-auth-title">Become a promoter</h1>
          <p className="eb-auth-sub">Free to join. Organizers pay you, not the other way round.</p>

          <form onSubmit={handleSubmit} className="eb-form-compact">
            {/* Pairs share a row from sm up so the whole form fits one screen. */}
            <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
              <div>
                <label htmlFor="su-name" className={`${labelClass} eb-req`}>Full name</label>
                <input
                  id="su-name"
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Amaka Obi"
                  required
                  aria-required="true"
                  className={fieldClass}
                />
              </div>
              <div>
                <label htmlFor="su-handle" className={`${labelClass} eb-req`}>Handle</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-subtle">@</span>
                  <input
                    id="su-handle"
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={handle}
                    onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24))}
                    placeholder="kingjesse"
                    required
                    aria-required="true"
                    aria-describedby="su-handle-hint"
                    minLength={3}
                    // inline: .eb-input's own padding sits outside Tailwind's layers and would win over pl-*
                    style={{ paddingLeft: "1.75rem" }}
                    className={fieldClass}
                  />
                </div>
              </div>
            </div>
            <p id="su-handle-hint" className="eb-hint -mt-1.5">Your links look like eventbuddy.africa/event-name/{handle || "yourhandle"}.</p>
            <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
              <div>
                <label htmlFor="su-email" className={`${labelClass} eb-req`}>Email</label>
                <input id="su-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@mail.com" required aria-required="true" className={fieldClass} />
              </div>
              <div>
                <label htmlFor="su-phone" className={`${labelClass} eb-req`}>Phone</label>
                <input id="su-phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))} placeholder="0801 234 5678" required aria-required="true" className={fieldClass} />
              </div>
            </div>
            <div>
              <label htmlFor="su-pw" className={`${labelClass} eb-req`}>Password</label>
              <div className="relative">
                <input
                  id="su-pw"
                  type={showPw ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                  aria-required="true"
                  minLength={8}
                  className={`${fieldClass} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-lg text-subtle hover:text-fg-3"
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="eb-alert" role="alert">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="eb-btn eb-btn--primary w-full">
              {loading ? "Creating account…" : "Create account"}
            </button>

            <p className="text-center text-xs leading-relaxed text-subtle">
              By creating an account you agree to our{" "}
              <Link href="/terms" className="text-fg-3 underline underline-offset-2 hover:text-fg">Terms</Link>{" "}
              and{" "}
              <Link href="/privacy" className="text-fg-3 underline underline-offset-2 hover:text-fg">Privacy Policy</Link>.
            </p>
          </form>

          <p className="mt-5 border-t border-white/10 pt-5 text-center text-sm text-fg-3">
            Organizing an event instead?{" "}
            <Link href="/signup" className="eb-link text-sm">
              Create an organizer account
            </Link>
            <br />
            Already have an account?{" "}
            <button type="button" onClick={() => router.push("/login?as=promoter")} className="eb-link text-sm">
              Sign in
            </button>
          </p>
    </AuthSplit>
  );
}