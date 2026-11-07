export const money = (n: number | null | undefined, cur = "OMR") =>
  `${cur} ${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;

export const num = (n: number | null | undefined) =>
  Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export const date = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";

export const dateTime = (d: string) =>
  new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function calcTotals(
  items: { quantity: number; unit_rate: number; unit: string }[],
  discountType: string,
  discountValue: number,
  vatRate: number
) {
  const subtotal = round3(items.reduce((s, i) => s + round3((i.unit === "ls" ? 1 : Number(i.quantity) || 0) * (Number(i.unit_rate) || 0)), 0));
  let discount = 0;
  if (discountType === "amount") discount = Math.min(Number(discountValue) || 0, subtotal);
  if (discountType === "percent") discount = round3((subtotal * Math.min(Number(discountValue) || 0, 100)) / 100);
  const net = round3(subtotal - discount);
  const vat = round3((net * vatRate) / 100);
  return { subtotal, discount, net, vat, total: round3(net + vat) };
}

export const statusColor: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  submitted: "bg-blue-100 text-blue-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  converted: "bg-violet-100 text-violet-700",
  issued: "bg-amber-100 text-amber-800",
  partially_paid: "bg-orange-100 text-orange-800",
  paid: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
};

export const label = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// Role names shown in the app
export const roleLabel = (r: string) =>
  ({ admin: "Administrator", owner: "Company owner", staff: "User", guest: "Guest (view only)" } as Record<string, string>)[r] || r;
