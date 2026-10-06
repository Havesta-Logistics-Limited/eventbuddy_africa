"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff, MailCheck } from "lucide-react";
import { AuthCentered, AuthSplit } from "@/components/auth/auth-shell";
import { isValidEmail, isValidPhoneStrict, sanitizePhoneInput } from "@/lib/validation";

// useSearchParams needs a Suspense boundary so the rest of the page can still be
// prerendered; the form itself renders immediately inside it.
export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  // The landing page's email field hands its value over as ?email=, so the visitor
  // doesn't have to type it twice.
  const prefillEmail = useSearchParams().get("email") ?? "";
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState(prefillEmail);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");

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
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, organizationName, email, phone, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't create your account.");
        setLoading(false);
        return;
      }
      setSubmittedEmail(email);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setLoading(false);
    }
  };

  if (submittedEmail) {
    return (
      <AuthCentered>
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-brand-500/15 flex items-center justify-center mx-auto mb-5">
            <MailCheck size={24} className="text-brand-500" />
          </div>
          <h1 className="eb-auth-title mb-2">Check your email</h1>
          <p className="text-muted text-sm mb-8">
            We&apos;ve sent a verification link to <span className="font-medium text-fg-2">{submittedEmail}</span>. Verify your email to
            activate your account — you won&apos;t be able to sign in until it&apos;s confirmed.
          </p>
          <button type="button" onClick={() => router.push("/login")} className="eb-link text-sm">
            Back to sign in
          </button>
        </div>
      </AuthCentered>
    );
  }

  const fieldClass = "eb-input";
  const labelClass = "eb-label";

  return (
    <AuthSplit
      headline="Your next event"
      accent="starts here."
      sub="Create your organization in a minute. Free to start, and you only pay when a ticket sells."
    >

          <h1 className="eb-auth-title">Create your account</h1>
          <p className="eb-auth-sub">Set up your organization in a minute.</p>

          <form onSubmit={handleSubmit} className="eb-form-compact">
            {/* Pairs share a row from sm up so the whole form fits one screen. */}
            <div className="grid grid-cols-2 gap-3">
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
                <label htmlFor="su-org" className={`${labelClass} eb-req`}>Organization Name</label>
                <input
                  id="su-org"
                  type="text"
                  autoComplete="organization"
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  placeholder="Summit Events"
                  required
                  aria-required="true"
                  aria-describedby="su-org-hint"
                  className={fieldClass}
                />
              </div>
            </div>
            <p id="su-org-hint" className="eb-hint -mt-1.5">Your organization name appears on your event links: eventbuddy.africa/your-org.</p>
            <div className="grid grid-cols-2 gap-3">
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle hover:text-fg-3"
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
            Want to earn by promoting events?{" "}
            <Link href="/promote" className="eb-link text-sm">
              Become a promoter
            </Link>
            <br />
            Already have an account?{" "}
            <button type="button" onClick={() => router.push("/login")} className="eb-link text-sm">
              Sign in
            </button>
          </p>
    </AuthSplit>
  );
}