"use client";

export default function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto mt-10 max-w-sm sm:mt-20">
      <div className="mb-6 flex flex-col items-center gap-2">
        <span className="iq-mark grid h-16 w-16 place-items-center rounded-2xl p-[3px] shadow-lg">
          <span className="grid h-full w-full place-items-center rounded-[13px] bg-[#05070d] text-2xl font-black text-white">IQ</span>
        </span>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="card p-5">{children}</div>
    </div>
  );
}
