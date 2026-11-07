// Omani Rial: new currency sign + amount with 3 decimals (same as tudo-inventory).
// The sign takes the colour and size of the text around it.
import { num } from "@/lib/format";

export function OmrSign({ className = "" }: { className?: string }) {
  return <i className={`omr-sign ${className}`} role="img" aria-label="OMR" />;
}

export default function Omr({ v, className = "" }: { v: number | null | undefined; className?: string }) {
  return (
    <span className={`omr ${className}`}>
      <OmrSign />
      {num(v)}
    </span>
  );
}
