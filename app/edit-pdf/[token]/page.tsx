"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMe } from "@/components/AuthGate";
import SharedDocView, { loadShared, type Shared } from "@/components/SharedDocView";
import { downloadFile, elementToPdf, safeFileName } from "@/lib/pdf";
import { templateOf } from "@/lib/pdfTemplate";

// One thing added on top of the document
type Overlay = {
  id: string;
  kind: "text" | "image" | "path" | "mark";
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  text?: string;
  size?: number; // font size for text
  src?: string; // image
  d?: string; // svg path for drawings
  stroke?: number;
};

type Tool = "select" | "text" | "draw" | "highlight";

const COLORS = ["#111827", "#e11d48", "#2563eb", "#059669", "#d97706", "#ffffff"];
const uid = () => Math.random().toString(36).slice(2, 10);

export default function EditPdf() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { isGuest } = useMe();
  const [d, setD] = useState<Shared | null>(null);
  const [state, setState] = useState<"loading" | "missing" | "ok">("loading");

  const [tool, setTool] = useState<Tool>("select");
  const [editText, setEditText] = useState(false);
  const [color, setColor] = useState("#e11d48");
  const [items, setItems] = useState<Overlay[]>([]);
  const [history, setHistory] = useState<Overlay[][]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [drawing, setDrawing] = useState<Overlay | null>(null);
  const [exporting, setExporting] = useState<"idle" | "making" | "ready">("idle");
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const box = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const imgInput = useRef<HTMLInputElement>(null);
  const [scale, setScale] = useState(1);
  const [pageH, setPageH] = useState(1100);

  useEffect(() => {
    loadShared(token).then((r) => {
      setD(r);
      setState(r ? "ok" : "missing");
    });
  }, [token]);

  // Fit the 800px page to the screen
  useLayoutEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(() => {
      if (box.current) setScale(Math.min(1, box.current.clientWidth / 800));
      if (page.current) setPageH(page.current.scrollHeight);
    });
    ro.observe(box.current);
    if (page.current) ro.observe(page.current);
    return () => ro.disconnect();
  }, [state]);

  // The document itself is rendered once, so text typed into it is not overwritten
  const docEl = useMemo(() => (d ? <SharedDocView d={d} bare /> : null), [d]);

  const tpl = d ? templateOf(d.company as never) : null;
  const title = d ? `${d.type === "quotation" ? "Quotation" : "Invoice"} ${String(d.doc.code)}` : "";

  // ---------- history ----------
  const commit = useCallback((next: Overlay[]) => {
    setItems((prev) => {
      setHistory((h) => [...h.slice(-40), prev]);
      return next;
    });
    setFile(null);
    setExporting("idle");
  }, []);
  const undo = () => {
    setHistory((h) => {
      if (!h.length) return h;
      setItems(h[h.length - 1]);
      return h.slice(0, -1);
    });
    setSel(null);
  };
  const update = (id: string, patch: Partial<Overlay>, save = false) => {
    const next = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
    if (save) commit(next);
    else setItems(next);
  };
  const removeSel = () => {
    if (!sel) return;
    commit(items.filter((i) => i.id !== sel));
    setSel(null);
  };

  // ---------- pointer helpers ----------
  const toDoc = (e: { clientX: number; clientY: number }) => {
    const r = page.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };

  const onSurfaceDown = (e: React.PointerEvent) => {
    const p = toDoc(e);
    if (tool === "text") {
      const it: Overlay = { id: uid(), kind: "text", x: p.x, y: p.y - 10, w: 220, h: 30, color, text: "Type here", size: 16 };
      commit([...items, it]);
      setSel(it.id);
      setTool("select");
      return;
    }
    if (tool === "draw" || tool === "highlight") {
      (e.target as Element).setPointerCapture(e.pointerId);
      const it: Overlay =
        tool === "draw"
          ? { id: uid(), kind: "path", x: 0, y: 0, w: 0, h: 0, color, d: `M${p.x.toFixed(1)},${p.y.toFixed(1)}`, stroke: 3 }
          : { id: uid(), kind: "mark", x: p.x, y: p.y, w: 1, h: 1, color: "#facc15" };
      setDrawing({ ...it, text: `${p.x},${p.y}` });
      return;
    }
    setSel(null);
  };
  const onSurfaceMove = (e: React.PointerEvent) => {
    if (!drawing) return;
    const p = toDoc(e);
    if (drawing.kind === "path") setDrawing({ ...drawing, d: `${drawing.d} L${p.x.toFixed(1)},${p.y.toFixed(1)}` });
    else {
      const [sx, sy] = String(drawing.text).split(",").map(Number);
      setDrawing({ ...drawing, x: Math.min(sx, p.x), y: Math.min(sy, p.y), w: Math.abs(p.x - sx), h: Math.abs(p.y - sy) });
    }
  };
  const onSurfaceUp = () => {
    if (!drawing) return;
    const done = { ...drawing, text: undefined };
    if (done.kind === "path" || (done.w > 4 && done.h > 4)) commit([...items, done]);
    setDrawing(null);
  };

  // Drag (move) and resize of an item
  const startDrag = (e: React.PointerEvent, it: Overlay, mode: "move" | "resize") => {
    if (tool !== "select") return;
    e.stopPropagation();
    setSel(it.id);
    const start = toDoc(e);
    const orig = { ...it };
    const before = items;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const p = toDoc(ev);
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      setItems((cur) =>
        cur.map((i) =>
          i.id !== it.id
            ? i
            : mode === "move"
              ? { ...i, x: orig.x + dx, y: orig.y + dy }
              : { ...i, w: Math.max(20, orig.w + dx), h: Math.max(16, orig.h + dy) }
        )
      );
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (moved) {
        setHistory((h) => [...h.slice(-40), before]);
        setFile(null);
        setExporting("idle");
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const addImage = (src: string, w = 140, h = 90) => {
    const y = (page.current?.scrollHeight || 1000) - 260;
    const it: Overlay = { id: uid(), kind: "image", x: 80, y, w, h, color, src };
    commit([...items, it]);
    setSel(it.id);
    setTool("select");
  };
  const pickImage = (f?: File) => {
    if (!f) return;
    if (f.size > 3 * 1024 * 1024) return setMsg("Image must be smaller than 3 MB.");
    const r = new FileReader();
    r.onload = () => addImage(String(r.result), 160, 120);
    r.readAsDataURL(f);
  };

  // ---------- export ----------
  const makePdf = async () => {
    setMsg(null);
    setSel(null);
    setEditText(false);
    setTool("select");
    setExporting("making");
    await new Promise((r) => setTimeout(r, 250));
    try {
      const name = safeFileName(`${title}${d?.client?.name ? ` ${d.client.name}` : ""}`) + ".pdf";
      const f = await elementToPdf(page.current!, name);
      setFile(f);
      setExporting("ready");
    } catch (e) {
      setMsg((e as Error).message || "Could not create the PDF");
      setExporting("idle");
    }
  };
  const send = async () => {
    if (!file) return;
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title });
        return;
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
    downloadFile(file);
    setMsg("PDF downloaded. Attach it in WhatsApp or email.");
  };

  if (isGuest) return <div className="card p-6 text-center text-slate-500">Guests cannot edit PDFs.</div>;
  if (state === "loading") return <p className="text-slate-500">Loading...</p>;
  if (state === "missing" || !d)
    return <div className="card p-6 text-center text-slate-500">This document is not available. Draft invoices must be issued first.</div>;

  const selected = items.find((i) => i.id === sel);
  const toolBtn = (t: Tool, icon: string, label: string) => (
    <button
      onClick={() => {
        setTool(t);
        if (t !== "select") setEditText(false);
      }}
      className={`flex shrink-0 flex-col items-center rounded-lg px-2.5 py-1.5 text-xs ${tool === t ? "bg-blue-600 text-white" : "btn-light !px-2.5 !py-1.5"}`}
    >
      <span className="text-base leading-none">{icon}</span>
      {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <button onClick={() => router.back()} className="text-sm text-slate-500">← Back</button>
          <h1 className="text-xl font-bold">Edit PDF: {title}</h1>
        </div>
        <div className="flex gap-2">
          {exporting !== "ready" ? (
            <button className="btn-accent" disabled={exporting === "making"} onClick={makePdf}>
              {exporting === "making" ? "Creating PDF..." : "Done: create PDF"}
            </button>
          ) : (
            <>
              <button className="btn-primary" onClick={send}>📤 Send PDF</button>
              <button className="btn-light" onClick={() => file && downloadFile(file)}>⬇ Download</button>
            </>
          )}
        </div>
      </div>

      <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
        Changes here only go into this PDF. The saved {d.type} is not changed. To change prices or items permanently, edit the {d.type} itself.
      </p>
      {msg && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">{msg}</p>}

      {/* Toolbar */}
      <div className="card sticky top-28 z-10 flex items-center gap-1.5 overflow-x-auto p-2 md:top-20">
        {toolBtn("select", "👆", "Move")}
        <button
          onClick={() => {
            setEditText(!editText);
            setTool("select");
            setSel(null);
          }}
          className={`flex shrink-0 flex-col items-center rounded-lg px-2.5 py-1.5 text-xs ${editText ? "bg-blue-600 text-white" : "btn-light !px-2.5 !py-1.5"}`}
        >
          <span className="text-base leading-none">📝</span>
          Edit text
        </button>
        {toolBtn("text", "🔤", "Add text")}
        {toolBtn("draw", "✍️", "Draw / sign")}
        {toolBtn("highlight", "🖍️", "Highlight")}
        {tpl?.stamp_url && (
          <button onClick={() => addImage(tpl.stamp_url, 110, 110)} className="btn-light flex shrink-0 flex-col items-center !px-2.5 !py-1.5 text-xs">
            <span className="text-base leading-none">🔴</span>Stamp
          </button>
        )}
        {tpl?.signature_url && (
          <button onClick={() => addImage(tpl.signature_url, 150, 60)} className="btn-light flex shrink-0 flex-col items-center !px-2.5 !py-1.5 text-xs">
            <span className="text-base leading-none">✒️</span>Signature
          </button>
        )}
        <button onClick={() => imgInput.current?.click()} className="btn-light flex shrink-0 flex-col items-center !px-2.5 !py-1.5 text-xs">
          <span className="text-base leading-none">🖼️</span>Picture
        </button>
        <input ref={imgInput} type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e.target.files?.[0])} />
        <span className="mx-1 h-8 w-px shrink-0 bg-slate-200" />
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => {
              setColor(c);
              if (selected && selected.kind !== "image") update(selected.id, { color: c }, true);
            }}
            className={`h-7 w-7 shrink-0 rounded-full border-2 ${color === c ? "border-blue-500" : "border-slate-300"}`}
            style={{ background: c }}
            aria-label={`Color ${c}`}
          />
        ))}
        <span className="mx-1 h-8 w-px shrink-0 bg-slate-200" />
        <button onClick={undo} disabled={!history.length} className="btn-light shrink-0 !px-2.5 text-xs">↶ Undo</button>
        {selected && (
          <>
            {selected.kind === "text" && (
              <>
                <button onClick={() => update(selected.id, { size: Math.max(8, (selected.size || 16) - 2) }, true)} className="btn-light shrink-0 !px-2.5 text-xs">A−</button>
                <button onClick={() => update(selected.id, { size: Math.min(48, (selected.size || 16) + 2) }, true)} className="btn-light shrink-0 !px-2.5 text-xs">A+</button>
              </>
            )}
            <button onClick={removeSel} className="btn-light shrink-0 !px-2.5 text-xs text-rose-600">🗑 Delete</button>
          </>
        )}
      </div>

      <p className="text-xs text-slate-500">
        {editText
          ? "Tap any text on the page and type to change it."
          : tool === "text"
            ? "Tap where you want to add text."
            : tool === "draw"
              ? "Draw or sign with your finger or mouse."
              : tool === "highlight"
                ? "Drag over an area to highlight it."
                : "Drag added items to move them. Use the corner handle to resize."}
      </p>

      {/* Page */}
      <div ref={box} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl" style={{ height: pageH * scale }}>
        <div style={{ width: 800, transform: `scale(${scale})`, transformOrigin: "top left" }}>
          <div ref={page} className="relative bg-white" style={{ width: 800 }}>
            <div
              contentEditable={editText}
              suppressContentEditableWarning
              className={editText ? "outline outline-2 outline-blue-400/60" : ""}
              style={{ caretColor: "#2563eb" }}
            >
              {docEl}
            </div>

            {/* Drawing surface (only active for Add text / Draw / Highlight) */}
            <svg
              className="absolute inset-0 h-full w-full"
              style={{ pointerEvents: tool === "select" ? "none" : "auto", touchAction: tool === "select" ? "auto" : "none", cursor: tool === "text" ? "text" : "crosshair" }}
              onPointerDown={onSurfaceDown}
              onPointerMove={onSurfaceMove}
              onPointerUp={onSurfaceUp}
            >
              {[...items, ...(drawing ? [drawing] : [])].map((it) =>
                it.kind === "path" ? (
                  <path
                    key={it.id}
                    d={it.d}
                    fill="none"
                    stroke={it.color}
                    strokeWidth={it.stroke}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ pointerEvents: tool === "select" ? "stroke" : "none", cursor: "pointer" }}
                    onPointerDown={(e) => {
                      if (tool !== "select") return;
                      e.stopPropagation();
                      setSel(it.id);
                    }}
                    opacity={sel === it.id ? 0.6 : 1}
                  />
                ) : it.kind === "mark" ? (
                  <rect key={it.id} x={it.x} y={it.y} width={it.w} height={it.h} fill={it.color} opacity={0.35} style={{ pointerEvents: "none" }} />
                ) : null
              )}
            </svg>

            {/* Text, pictures and highlights (movable) */}
            {items
              .filter((it) => it.kind !== "path")
              .map((it) => (
                <div
                  key={it.id}
                  className={`absolute ${sel === it.id ? "outline outline-2 outline-dashed outline-blue-500" : ""}`}
                  style={{
                    left: it.x,
                    top: it.y,
                    width: it.w,
                    height: it.kind === "text" ? undefined : it.h,
                    minHeight: it.kind === "text" ? it.h : undefined,
                    pointerEvents: tool === "select" ? "auto" : "none",
                    background: it.kind === "mark" ? "transparent" : undefined,
                    touchAction: "none",
                  }}
                  onPointerDown={(e) => startDrag(e, it, "move")}
                >
                  {it.kind === "text" && (
                    <div
                      contentEditable
                      suppressContentEditableWarning
                      onPointerDown={(e) => {
                        if (sel === it.id) e.stopPropagation(); // second tap: type instead of move
                      }}
                      onBlur={(e) => update(it.id, { text: e.currentTarget.innerText }, true)}
                      className="whitespace-pre-wrap break-words px-1 font-semibold outline-none"
                      style={{ color: it.color, fontSize: it.size, lineHeight: 1.25 }}
                    >
                      {it.text}
                    </div>
                  )}
                  {it.kind === "image" && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.src}
                      alt=""
                      crossOrigin={it.src?.includes(".supabase.co/") ? "anonymous" : undefined}
                      draggable={false}
                      className="h-full w-full object-contain"
                    />
                  )}
                  {sel === it.id && (
                    <span
                      className="absolute -bottom-2 -right-2 h-5 w-5 cursor-se-resize rounded-full border-2 border-white bg-blue-600 shadow"
                      onPointerDown={(e) => startDrag(e, it, "resize")}
                    />
                  )}
                </div>
              ))}
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-slate-500">
        When you are done, press <b>Done: create PDF</b>, then <b>Send PDF</b>. <Link href="/" className="underline">Dashboard</Link>
      </p>
    </div>
  );
}
