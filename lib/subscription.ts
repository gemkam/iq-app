// Subscription state of a company (free trial, paid, expired, suspended)
export type SubFields = {
  plan: string;
  trial_ends_at: string;
  paid_until: string | null;
  suspended: boolean;
};

export type SubState = "trial" | "paid" | "expired" | "suspended";

const DAY = 864e5;

export function subStatus(c: SubFields | null | undefined): { state: SubState; endsAt: string | null; daysLeft: number } {
  if (!c) return { state: "trial", endsAt: null, daysLeft: 0 };
  const now = Date.now();
  if (c.suspended) return { state: "suspended", endsAt: null, daysLeft: 0 };
  const paid = c.paid_until ? new Date(c.paid_until).getTime() : 0;
  const trial = c.trial_ends_at ? new Date(c.trial_ends_at).getTime() : 0;
  if (paid > now) return { state: "paid", endsAt: c.paid_until, daysLeft: Math.ceil((paid - now) / DAY) };
  if (trial > now) return { state: "trial", endsAt: c.trial_ends_at, daysLeft: Math.ceil((trial - now) / DAY) };
  return { state: "expired", endsAt: c.paid_until || c.trial_ends_at, daysLeft: 0 };
}

export const planLabel = (p: string) => ({ trial: "Free trial", basic: "Basic", pro: "Pro" } as Record<string, string>)[p] || p;

export const stateLabel: Record<SubState, string> = {
  trial: "Free trial",
  paid: "Active",
  expired: "Expired",
  suspended: "Suspended",
};

export const stateColor: Record<SubState, string> = {
  trial: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-700",
  expired: "bg-red-100 text-red-700",
  suspended: "bg-slate-200 text-slate-700",
};
