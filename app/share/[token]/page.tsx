"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import SharedDocView, { loadShared, type Shared } from "@/components/SharedDocView";

export default function SharedDoc() {
  const { token } = useParams<{ token: string }>();
  const [d, setD] = useState<Shared | null>(null);
  const [state, setState] = useState<"loading" | "missing" | "ok">("loading");

  useEffect(() => {
    loadShared(token).then((r) => {
      setD(r);
      setState(r ? "ok" : "missing");
    });
  }, [token]);

  if (state === "loading") return <p className="p-6 text-slate-500">Loading...</p>;
  if (state === "missing" || !d) return <p className="p-6 text-center text-slate-600">This link is not valid or the document is not available.</p>;
  return <SharedDocView d={d} />;
}
