"use client";
import { useCompany } from "@/lib/useCompany";
import QuotationForm from "@/components/QuotationForm";
import { useMe } from "@/components/AuthGate";

export default function NewQuotation() {
  const { company } = useCompany();
  const { readOnly: isGuest } = useMe();
  if (isGuest) return <div className="card p-6 text-center text-slate-500">View only: new quotations cannot be created right now.</div>;
  if (!company) return <p className="text-slate-500">Loading...</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">New Quotation</h1>
      <QuotationForm company={company} />
    </div>
  );
}
