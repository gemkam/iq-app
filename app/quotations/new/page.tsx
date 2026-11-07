"use client";
import { useCompany } from "@/lib/useCompany";
import QuotationForm from "@/components/QuotationForm";

export default function NewQuotation() {
  const { company } = useCompany();
  if (!company) return <p className="text-slate-500">Loading...</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">New Quotation</h1>
      <QuotationForm company={company} />
    </div>
  );
}
