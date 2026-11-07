export type Company = {
  id: string;
  name: string;
  name_ar: string | null;
  cr_number: string | null;
  vatin: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  currency: string;
  vat_rate: number;
  vat_registered: boolean;
  default_terms: string | null;
  default_validity_days: number;
};

export type Unit = { code: string; label: string; is_lump_sum: boolean; sort_order: number };

export type Client = {
  id: string;
  name: string;
  contact_person: string | null;
  mobile: string | null;
  email: string | null;
  address: string | null;
  vatin: string | null;
};

export type QuotationStatus = "draft" | "submitted" | "approved" | "rejected" | "converted";
export type DiscountType = "none" | "amount" | "percent";

export type Quotation = {
  id: string;
  company_id: string;
  client_id: string | null;
  number: number;
  code: string;
  project_name: string | null;
  project_code: string | null;
  location: string | null;
  attention_to: string | null;
  mobile: string | null;
  quote_date: string;
  validity_days: number;
  status: QuotationStatus;
  subtotal: number;
  discount_type: DiscountType;
  discount_value: number;
  discount_amount: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  notes: string | null;
  terms: string | null;
  created_at: string;
  clients?: Client | null;
};

export type Item = {
  id?: string;
  sort_order: number;
  description: string;
  quantity: number;
  unit: string;
  unit_rate: number;
  amount?: number;
};

export type InvoiceStatus = "draft" | "issued" | "partially_paid" | "paid" | "cancelled";

export type Invoice = {
  id: string;
  company_id: string;
  quotation_id: string | null;
  client_id: string | null;
  code: string;
  base_no: number;
  seq: number;
  kind: "standard" | "advance" | "milestone" | "final";
  doc_type: "invoice" | "credit_note" | "debit_note";
  issue_date: string;
  due_date: string | null;
  description: string | null;
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  amount_paid: number;
  balance: number;
  status: InvoiceStatus;
  einvoice_status: string;
  issued_at: string | null;
  created_at: string;
  clients?: Client | null;
  quotations?: Pick<Quotation, "code" | "project_name" | "project_code" | "location" | "attention_to" | "mobile" | "total"> | null;
};

export type Payment = {
  id: string;
  amount: number;
  paid_on: string;
  method: string | null;
  reference: string | null;
  created_at: string;
};
