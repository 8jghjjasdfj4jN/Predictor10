/*
═══════════════════════════════════════════════════════════════════════════
WC CHAT (temporary) — remove after the World Cup. See docs/wc-chat-teardown.md.
═══════════════════════════════════════════════════════════════════════════

Per-pool chat — /pools/:competitionSlug/:poolId/chat

Reached from the "Table chat" button on the Tables page (shown only when the
viewer is entered in that tier). Entrant-gated server-side: non-entrants get a
403 and the friendly "enter to join" state.

Realtime model is polling, matching the rest of the app (no websockets): the
message list refetches every 5s while the tab is visible, plus on window focus.
Plain text + emoji only — emoji come straight from the phone keyboard; no
picker, no images, no link handling.

Admins (the three founding admins) see a small Hide control on each message —
a soft-delete that calls the audited admin endpoint.

This whole file is deleted at teardown — no sentinel fences inside it.
*/

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchPoolMessages,
  postPoolMessage,
  hidePoolMessage,
  ChatError,
  type ChatMessage,
} from "@/lib/portal-api";

const POLL_MS = 5000;
const MAX_LEN = 500;

const TIME_FMT = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

function formatTime(iso: string): string {
  return TIME_FMT.format(new Date(iso));
}

export default function PoolChatPage() {
  const [, params] = useRoute("/pools/:competitionSlug/:poolId/chat");
  const poolId = params?.poolId ?? "";
  const { user } = useAuth();
  const isAdmin = !!user?.isAdmin;

  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [loadError, setLoadError] = useState<{ status: number; message: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const atBottomRef = useRef(true);
  const inFlightRef = useRef(false);

  // ─── Load + poll ──────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!poolId || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const payload = await fetchPoolMessages(poolId);
      setMessages(payload.messages);
      setLoadError(null);
    } catch (err) {
      // Only surface a hard error if we have nothing to show yet; transient
      // poll failures while messages are on screen stay silent.
      if (messages === null) {
        const status = err instanceof ChatError ? err.status : 0;
        const message = err instanceof Error ? err.message : "Couldn't load chat.";
        setLoadError({ status, message });
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [poolId, messages]);

  // Initial load.
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolId]);

  // Poll while the tab is visible; refetch on focus.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!document.hidden) void load();
    }, POLL_MS);
    function onFocus() {
      void load();
    }
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  // ─── Auto-scroll to bottom on new messages (only if already near bottom) ─

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (atBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottomRef.current = distanceFromBottom < 80;
  }

  // ─── Send ─────────────────────────────────────────────────────────────

  async function handleSend() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    atBottomRef.current = true;
    try {
      const message = await postPoolMessage(poolId, body);
      setDraft("");
      // Optimistic append; next poll replaces the list by server state. Dedupe
      // by id so the appended message and the polled copy never double up.
      setMessages((prev) => {
        const base = prev ?? [];
        if (base.some((m) => m.id === message.id)) return base;
        return [...base, message];
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send message.");
    } finally {
      setSending(false);
    }
  }

  // ─── Admin hide ─────────────────────────────────────────────────────────

  async function handleHide(id: string) {
    try {
      await hidePoolMessage(id);
      setMessages((prev) => (prev ? prev.filter((m) => m.id !== id) : prev));
      toast.success("Message hidden");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't hide message.");
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────

  const backHref = "/tables";

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3">
        <Link
          href={backHref}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full",
            "text-white/70 transition hover:bg-white/[0.06] hover:text-white",
            "outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
          )}
          aria-label="Back to tables"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </Link>
        <h1 className="font-['Barlow_Condensed'] text-[1.4rem] font-bold uppercase tracking-[0.03em] text-white">
          Table chat
        </h1>
      </div>

      {/* Body */}
      {loadError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="font-['Manrope'] text-[0.9rem] text-white/70">
            {loadError.status === 403
              ? "Enter this tier to join the chat."
              : loadError.status === 401
                ? "Sign in to view the chat."
                : loadError.message}
          </p>
        </div>
      ) : messages === null ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-white/50">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          <p className="font-['Manrope'] text-xs">Loading chat…</p>
        </div>
      ) : (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 space-y-2 overflow-y-auto px-4 py-4"
        >
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
              <p className="font-['Manrope'] text-[0.9rem] text-white/60">No messages yet.</p>
              <p className="font-['Manrope'] text-[0.78rem] text-white/40">
                Say hello to the table.
              </p>
            </div>
          ) : (
            messages.map((m) => <MessageRow key={m.id} m={m} isAdmin={isAdmin} onHide={handleHide} />)
          )}
        </div>
      )}

      {/* Composer — only when the viewer can actually post (no hard error). */}
      {!loadError && messages !== null && (
        <div className="shrink-0 border-t border-white/10 px-3 py-2.5">
          <div className="flex items-end gap-2">
            <input
              type="text"
              value={draft}
              maxLength={MAX_LEN}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="Message the table…"
              className={cn(
                "min-h-[44px] flex-1 rounded-full border border-white/10 bg-white/[0.04] px-4",
                "font-['Manrope'] text-[0.9rem] text-white placeholder:text-white/35",
                "outline-none focus:border-emerald-400/40 focus:bg-white/[0.06]",
              )}
              aria-label="Message"
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={sending || draft.trim().length === 0}
              className={cn(
                "flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full",
                "bg-emerald-400 text-emerald-950 transition hover:bg-emerald-300",
                "disabled:cursor-not-allowed disabled:opacity-40",
                "outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
              )}
              aria-label="Send"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Send className="h-4 w-4" aria-hidden />
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageRow({
  m,
  isAdmin,
  onHide,
}: {
  m: ChatMessage;
  isAdmin: boolean;
  onHide: (id: string) => void;
}) {
  return (
    <div className={cn("flex flex-col", m.isMine ? "items-end" : "items-start")}>
      {!m.isMine && (
        <span className="mb-0.5 px-1 font-['Manrope'] text-[0.66rem] font-semibold text-emerald-300/80">
          {m.authorDisplayName}
        </span>
      )}
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3.5 py-2",
          m.isMine
            ? "bg-emerald-400/90 text-emerald-950"
            : "border border-white/10 bg-white/[0.05] text-white",
        )}
      >
        <p className="whitespace-pre-wrap break-words font-['Manrope'] text-[0.9rem] leading-snug">
          {m.body}
        </p>
      </div>
      <div className="mt-0.5 flex items-center gap-2 px-1">
        <span className="font-['Manrope'] text-[0.6rem] tabular-nums text-white/35">
          {formatTime(m.createdAt)}
        </span>
        {isAdmin && (
          <button
            type="button"
            onClick={() => onHide(m.id)}
            className="font-['Manrope'] text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-rose-300/70 transition hover:text-rose-200"
          >
            Hide
          </button>
        )}
      </div>
    </div>
  );
}
