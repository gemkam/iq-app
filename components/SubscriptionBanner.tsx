"use client";
import { useMe } from "./AuthGate";
import { subStatus } from "@/lib/subscription";
import { date } from "@/lib/format";

// Thin bar under the top menu: free-trial days left, renewal reminder, or view-only notice
export default function SubscriptionBanner() {
  const { me, isAdmin, isGuest } = useMe();
  if (!me || isGuest) return null;
  const s = subStatus(me.sub);

  if (s.state === "trial") {
    const urgent = s.daysLeft <= 5;
    return (
      <div className={`py-1 text-center text-xs font-semibold ${urgent ? "bg-rose-500 text-white" : "bg-amber-400 text-amber-950"}`}>
        Free trial: {s.daysLeft} {s.daysLeft === 1 ? "day" : "days"} left (until {date(s.endsAt)})
        {!isAdmin && " · contact your administrator to subscribe"}
      </div>
    );
  }
  if (s.state === "paid") {
    if (s.daysLeft > 7) return null;
    return (
      <div className="bg-amber-400 py-1 text-center text-xs font-semibold text-amber-950">
        Subscription renews in {s.daysLeft} {s.daysLeft === 1 ? "day" : "days"} ({date(s.endsAt)})
      </div>
    );
  }
  return (
    <div className="bg-rose-600 py-1.5 text-center text-xs font-semibold text-white">
      {s.state === "suspended" ? "This company is suspended." : "Subscription ended."}{" "}
      {isAdmin ? "You can still edit as administrator. Renew it in Admin → Subscriptions." : "View only: your data is safe. Contact your administrator to renew."}
    </div>
  );
}
