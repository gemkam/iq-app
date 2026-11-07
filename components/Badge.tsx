import { label, statusColor } from "@/lib/format";

export default function Badge({ status }: { status: string }) {
  return <span className={`badge ${statusColor[status] || "bg-slate-100 text-slate-700"}`}>{label(status)}</span>;
}
