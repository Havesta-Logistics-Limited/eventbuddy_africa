"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Plus, Users, X, Edit2, Trash2, Landmark, ShieldCheck, UserCircle } from "lucide-react";
import { Shell } from "@/components/shell";
import { useRequireRole } from "@/lib/auth";
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client";
import { PersistError, addStaff, deleteStaff, updateStaff, useDestinations, useEvents, useStaff, useUniversities } from "@/lib/store";
import { Role } from "@/lib/types";
import { getTemplate } from "@/lib/event-templates";
import { Reveal } from "@/components/reveal";
import { AuthLoading } from "@/components/auth-loading";
import { TwoFactorSettings } from "@/components/two-factor-settings";
import { MfaNagBanner } from "@/components/mfa-nag-banner";

const ADMIN_ONLY: Role[] = ["admin"];

type Tab = "profile" | "staff" | "payouts";

type PayoutChangeStatus = "none" | "requested" | "approved";

type OrgPayout = {
  paystackSubaccountCode: string | null;
  payoutBankName: string | null;
  payoutAccountNumber: string | null;
  payoutAccountName: string | null;
  payoutChangeStatus: PayoutChangeStatus;
};

const EMPTY_STAFF = { id: "", name: "", email: "", role: "staff" as const, destinationId: "", universityId: "", eventId: "" };

export default function AdminPage() {
  const session = useRequireRole(ADMIN_ONLY);
  const staff = useStaff();
  const universities = useUniversities();
  const destinations = useDestinations();
  const events = useEvents();
  const [tab, setTab] = useState<Tab>("staff");

  const [staffForm, setStaffForm] = useState(EMPTY_STAFF);
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [profileEmail, setProfileEmail] = useState("");
  const [profileFullName, setProfileFullName] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      setProfileEmail(data.user?.email || "");
      setProfileFullName((data.user?.user_metadata?.full_name as string | undefined) || "");
      setLoadingProfile(false);
    });
  }, []);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ data: { full_name: profileFullName.trim() } });
      if (error) throw error;
      toast.success("Name updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save your name.");
    } finally {
      setSavingName(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError("");
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords don't match.");
      return;
    }
    setChangingPassword(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password updated");
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Couldn't update your password.");
    } finally {
      setChangingPassword(false);
    }
  }

  const [orgPayout, setOrgPayout] = useState<OrgPayout | null>(null);
  const [loadingPayout, setLoadingPayout] = useState(true);
  const [banks, setBanks] = useState<{ name: string; code: string }[]>([]);
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [payoutBankCode, setPayoutBankCode] = useState("");
  const [payoutAccountNumber, setPayoutAccountNumber] = useState("");
  const [resolvedAccountName, setResolvedAccountName] = useState("");
  const [resolvingAccount, setResolvingAccount] = useState(false);
  const [savingPayout, setSavingPayout] = useState(false);
  const [payoutError, setPayoutError] = useState("");
  const [requestingChange, setRequestingChange] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase
      .from("organizations")
      .select("paystack_subaccount_code, payout_bank_name, payout_account_number, payout_account_name, payout_change_status")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setOrgPayout({
            paystackSubaccountCode: data.paystack_subaccount_code,
            payoutBankName: data.payout_bank_name,
            payoutAccountNumber: data.payout_account_number,
            payoutAccountName: data.payout_account_name,
            payoutChangeStatus: (data.payout_change_status as PayoutChangeStatus) || "none",
          });
        }
        setLoadingPayout(false);
      });
  }, []);

  async function handleRequestPayoutChange() {
    setRequestingChange(true);
    try {
      const res = await fetch("/api/paystack/subaccount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request-change" }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Couldn't submit that request.");
      setOrgPayout((prev) => (prev ? { ...prev, payoutChangeStatus: "requested" } : prev));
      toast.success("Change requested — we'll review it and let you know.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't submit that request.");
    } finally {
      setRequestingChange(false);
    }
  }

  useEffect(() => {
    if (tab !== "payouts" || banks.length > 0 || loadingBanks) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingBanks(true);
    fetch("/api/paystack/banks")
      .then((res) => res.json())
      .then((json) => setBanks(json.banks || []))
      .finally(() => setLoadingBanks(false));
  }, [tab, banks.length, loadingBanks]);

  async function handleResolveAccount() {
    setPayoutError("");
    setResolvedAccountName("");
    if (!payoutBankCode || payoutAccountNumber.trim().length < 10) {
      setPayoutError("Select a bank and enter a valid account number.");
      return;
    }
    const bankName = banks.find((b) => b.code === payoutBankCode)?.name || "";
    setResolvingAccount(true);
    try {
      const res = await fetch("/api/paystack/subaccount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve", bankCode: payoutBankCode, bankName, accountNumber: payoutAccountNumber.trim() }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Couldn't verify that account number.");
      setResolvedAccountName(json.accountName);
    } catch (err) {
      setPayoutError(err instanceof Error ? err.message : "Couldn't verify that account number.");
    } finally {
      setResolvingAccount(false);
    }
  }

  async function handleSavePayout() {
    setPayoutError("");
    const bankName = banks.find((b) => b.code === payoutBankCode)?.name || "";
    setSavingPayout(true);
    try {
      const res = await fetch("/api/paystack/subaccount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", bankCode: payoutBankCode, bankName, accountNumber: payoutAccountNumber.trim() }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Couldn't set up payouts.");
      setOrgPayout({
        paystackSubaccountCode: json.subaccountCode,
        payoutBankName: bankName,
        payoutAccountNumber: payoutAccountNumber.trim(),
        payoutAccountName: json.accountName,
        payoutChangeStatus: "none",
      });
      setPayoutBankCode("");
      setPayoutAccountNumber("");
      setResolvedAccountName("");
      toast.success("Payouts are set up — ticket sales will now split straight to this account.");
    } catch (err) {
      setPayoutError(err instanceof Error ? err.message : "Couldn't set up payouts.");
    } finally {
      setSavingPayout(false);
    }
  }

  if (!session) return <AuthLoading />;

  const staffUnis = staffForm.destinationId ? universities.filter((u) => u.destinationId === staffForm.destinationId) : [];
  const selectedStaffEvent = staffForm.eventId ? events.find((e) => e.id === staffForm.eventId) : undefined;
  const staffEventUsesDestinations = selectedStaffEvent ? getTemplate(selectedStaffEvent.templateId).usesDestinations : true;

  async function runSave(action: () => Promise<unknown>, onSuccess: () => void, successMessage: string) {
    setFormError("");
    setSaving(true);
    try {
      await action();
      onSuccess();
      toast.success(successMessage);
    } catch (err) {
      setFormError(err instanceof PersistError ? err.message : "Couldn't save your changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(action: () => Promise<void>, successMessage: string) {
    try {
      await action();
      toast.success(successMessage);
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't complete that action. Please try again.");
    }
  }

  const handleAddStaff = (e: React.FormEvent) => {
    e.preventDefault();
    runSave(
      () => (staffForm.id ? updateStaff(staffForm.id, staffForm) : addStaff(staffForm)),
      () => {
        setShowStaffForm(false);
        setStaffForm(EMPTY_STAFF);
      },
      staffForm.id ? "Staff updated" : "Staff added"
    );
  };

  const tabs: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: "profile", label: "Profile", icon: UserCircle },
    { id: "staff", label: "Staff", icon: Users },
    { id: "payouts", label: "Payouts", icon: Landmark },
  ];

  return (
    <Shell>
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="font-display text-2xl text-slate-900">Settings</h1>
          <p className="text-slate-500 text-sm mt-0.5">Manage your profile, staff, and ticket payouts</p>
        </div>

        <MfaNagBanner onSetup={() => setTab("profile")} />

        <div className="flex flex-wrap gap-1 mb-6 bg-slate-100 rounded-lg p-1 w-fit">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === id ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {tab === "profile" && (
          <div key="profile" className="animate-tab-fade space-y-8 max-w-lg">
            <div>
              <h2 className="font-semibold text-slate-800 mb-4">Your profile</h2>
              {loadingProfile ? (
                <div className="h-32 rounded-xl bg-slate-100 animate-pulse" />
              ) : (
                <form onSubmit={handleSaveName} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Full name</label>
                    <input
                      required
                      value={profileFullName}
                      onChange={(e) => setProfileFullName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#C21FAF]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Email address</label>
                    <input
                      disabled
                      value={profileEmail}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm bg-slate-50 text-slate-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={savingName}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60 transition-transform active:scale-[0.97]"
                    style={{ background: "#C21FAF" }}
                  >
                    {savingName ? "Saving…" : "Save name"}
                  </button>
                </form>
              )}
            </div>

            <div>
              <h2 className="font-semibold text-slate-800 mb-4">Change password</h2>
              <form onSubmit={handleChangePassword} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">New password</label>
                  <input
                    required
                    type="password"
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#C21FAF]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm new password</label>
                  <input
                    required
                    type="password"
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#C21FAF]"
                  />
                </div>
                {passwordError && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 text-rose-700 text-sm">
                    <AlertCircle size={15} className="mt-0.5 shrink-0" />
                    {passwordError}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={changingPassword}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60 transition-transform active:scale-[0.97]"
                  style={{ background: "#C21FAF" }}
                >
                  {changingPassword ? "Updating…" : "Update password"}
                </button>
              </form>
            </div>

            <div>
              <h2 className="font-semibold text-slate-800 mb-4">Two-factor authentication</h2>
              <TwoFactorSettings />
            </div>
          </div>
        )}

        {tab === "staff" && (
          <div key="staff" className="animate-tab-fade">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="font-semibold text-slate-800 min-w-0">Team Members ({staff.filter((s) => s.role !== "rep").length})</h2>
              <button
                onClick={() => {
                  setStaffForm(EMPTY_STAFF);
                  setShowStaffForm(true);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-transform active:scale-[0.97] shrink-0 whitespace-nowrap"
                style={{ background: "#C21FAF" }}
              >
                <Plus size={14} />
                Add Staff
              </button>
            </div>
            <div className="space-y-3">
              {staff
                .filter((s) => s.role !== "rep")
                .map((s, i) => {
                  const dest = s.destinationId ? destinations.find((d) => d.id === s.destinationId) : null;
                  const uni = s.universityId ? universities.find((u) => u.id === s.universityId) : null;
                  const ev = s.eventId ? events.find((e) => e.id === s.eventId) : null;
                  return (
                    <Reveal key={s.id} index={i}>
                    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 group hover:border-[#C21FAF]/30 hover:shadow-sm transition-all">
                      <div className="w-10 h-10 rounded-full bg-[#C21FAF]/10 flex items-center justify-center text-[#C21FAF] font-semibold shrink-0">{s.name.charAt(0)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900">{s.name}</p>
                        <p className="text-sm text-slate-500">{s.email}</p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span
                          className="px-2 py-0.5 rounded-full font-medium"
                          style={s.role === "admin" ? { background: "#e8f0fe", color: "#1a3a6e" } : { background: "#f1f5f9", color: "#475569" }}
                        >
                          {s.role}
                        </span>
                        {dest && <span className="px-2 py-0.5 rounded-full bg-[#C21FAF]/10 text-[#C21FAF] hidden sm:inline-block">{dest.flag} {dest.name}</span>}
                        {uni && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 hidden sm:inline-block">{uni.shortName}</span>}
                        {ev && <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 max-w-[120px] sm:max-w-[160px] truncate">{ev.name.split("—")[0].trim()}</span>}
                      </div>
                      <div className="flex items-center gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity ml-2 shrink-0">
                        <button
                          onClick={() => {
                            setStaffForm({
                              id: s.id,
                              name: s.name,
                              email: s.email,
                              role: "staff",
                              destinationId: s.destinationId || "",
                              universityId: s.universityId || "",
                              eventId: s.eventId || "",
                            });
                            setShowStaffForm(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-[#C21FAF] rounded-md hover:bg-slate-100"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => handleDelete(() => deleteStaff(s.id), `${s.name} removed`)} className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    </Reveal>
                  );
                })}
            </div>

            {showStaffForm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-modal-backdrop">
                <div className="bg-white rounded-2xl animate-modal-panel w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh]">
                  <div className="flex items-center justify-between p-6 border-b border-slate-100">
                    <h2 className="font-semibold text-slate-900">{staffForm.id ? "Edit Staff" : "Add Staff Member"}</h2>
                    <button onClick={() => setShowStaffForm(false)}>
                      <X size={20} className="text-slate-400" />
                    </button>
                  </div>
                  <form onSubmit={handleAddStaff} className="p-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
                      <input
                        required
                        value={staffForm.name}
                        onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#C21FAF]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                      <input
                        required
                        type="email"
                        value={staffForm.email}
                        onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#C21FAF]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Assigned Event</label>
                      <select
                        value={staffForm.eventId}
                        onChange={(e) => {
                          const ev = events.find((x) => x.id === e.target.value);
                          const usesDestinations = ev ? getTemplate(ev.templateId).usesDestinations : true;
                          setStaffForm({
                            ...staffForm,
                            eventId: e.target.value,
                            ...(usesDestinations ? {} : { destinationId: "", universityId: "" }),
                          });
                        }}
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#C21FAF] bg-white"
                      >
                        <option value="">Select event</option>
                        {events.map((ev) => (
                          <option key={ev.id} value={ev.id}>
                            {ev.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    {staffEventUsesDestinations && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">Destination</label>
                          <select
                            value={staffForm.destinationId}
                            onChange={(e) => setStaffForm({ ...staffForm, destinationId: e.target.value, universityId: "" })}
                            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#C21FAF] bg-white"
                          >
                            <option value="">Select destination</option>
                            {destinations.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.flag} {d.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">University</label>
                          <select
                            value={staffForm.universityId}
                            onChange={(e) => setStaffForm({ ...staffForm, universityId: e.target.value })}
                            disabled={!staffForm.destinationId}
                            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#C21FAF] bg-white disabled:opacity-50"
                          >
                            <option value="">Select university</option>
                            {staffUnis.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                    {formError && (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 text-rose-700 text-sm">
                        <AlertCircle size={15} className="mt-0.5 shrink-0" />
                        {formError}
                      </div>
                    )}
                    <div className="flex gap-3 pt-2">
                      <button type="button" onClick={() => setShowStaffForm(false)} className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
                        Cancel
                      </button>
                      <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-60 transition-transform active:scale-[0.97]" style={{ background: "#C21FAF" }}>
                        {saving ? "Saving…" : staffForm.id ? "Save Changes" : "Add Staff"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "payouts" && (
          <div key="payouts" className="animate-tab-fade">
            <div className="mb-4">
              <h2 className="font-semibold text-slate-800">Ticket payouts</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Add your bank account once — every paid ticket sold on eventbuddy settles straight into it automatically, minus eventbuddy&apos;s
                transaction fee. eventbuddy never holds or forwards this money itself.
              </p>
            </div>

            {loadingPayout ? (
              <div className="bg-white rounded-xl border border-slate-200 p-6 text-sm text-slate-400">Loading…</div>
            ) : orgPayout?.paystackSubaccountCode && orgPayout.payoutChangeStatus !== "approved" ? (
              <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <ShieldCheck size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900">Payouts are set up</p>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {orgPayout.payoutAccountName} · {orgPayout.payoutBankName} · {orgPayout.payoutAccountNumber}
                  </p>
                  <div className="mt-3">
                    {orgPayout.payoutChangeStatus === "requested" ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
                        Change requested — awaiting approval
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleRequestPayoutChange}
                        disabled={requestingChange}
                        className="text-xs font-medium text-slate-600 hover:text-slate-900 underline underline-offset-2 disabled:opacity-60"
                      >
                        {requestingChange ? "Requesting…" : "Request a change to these details"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 p-5 max-w-md space-y-4">
                {orgPayout?.payoutChangeStatus === "approved" && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm">
                    <ShieldCheck size={15} className="mt-0.5 shrink-0" />
                    Your change request was approved — enter your new bank details below.
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Bank</label>
                  <select
                    value={payoutBankCode}
                    onChange={(e) => {
                      setPayoutBankCode(e.target.value);
                      setResolvedAccountName("");
                    }}
                    disabled={loadingBanks}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#C21FAF] bg-white disabled:opacity-50"
                  >
                    <option value="">{loadingBanks ? "Loading banks…" : "Select bank"}</option>
                    {banks.map((b) => (
                      <option key={b.code} value={b.code}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Account number</label>
                  <input
                    value={payoutAccountNumber}
                    onChange={(e) => {
                      setPayoutAccountNumber(e.target.value.replace(/\D/g, ""));
                      setResolvedAccountName("");
                    }}
                    inputMode="numeric"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#C21FAF]"
                    placeholder="0123456789"
                  />
                </div>

                {resolvedAccountName ? (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm">
                    <ShieldCheck size={15} className="mt-0.5 shrink-0" />
                    Verified: {resolvedAccountName}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleResolveAccount}
                    disabled={resolvingAccount}
                    className="w-full py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    {resolvingAccount ? "Verifying…" : "Verify account"}
                  </button>
                )}

                {payoutError && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 text-rose-700 text-sm">
                    <AlertCircle size={15} className="mt-0.5 shrink-0" />
                    {payoutError}
                  </div>
                )}

                {resolvedAccountName && (
                  <button
                    type="button"
                    onClick={handleSavePayout}
                    disabled={savingPayout}
                    className="w-full py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-60 transition-transform active:scale-[0.97]"
                    style={{ background: "#C21FAF" }}
                  >
                    {savingPayout ? "Setting up…" : "Confirm and set up payouts"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}
