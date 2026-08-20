"use client";

import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { mapXiaoyaPageContext } from "@/lib/xiaoya/pageContext";
import {
  getXiaoyaSuggestions,
  type XiaoyaLocale,
  type XiaoyaSuggestion,
  xiaoyaCopy,
} from "./copy";
import { XiaoyaSprout } from "./XiaoyaSprout";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type StreamEvent = {
  type: "meta" | "delta" | "done" | "error";
  text?: string;
  suggestions?: XiaoyaSuggestion[];
};

let messageSequence = 0;

function createMessageId(): string {
  messageSequence += 1;
  return `xiaoya-message-${messageSequence}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeSuggestions(value: unknown): XiaoyaSuggestion[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item): XiaoyaSuggestion[] => {
    if (typeof item === "string") {
      const label = item.trim();
      return label ? [{ label }] : [];
    }
    if (!isRecord(item) || typeof item.label !== "string") return [];

    const label = item.label.trim();
    if (!label) return [];
    const href = typeof item.href === "string" && /^\/(?!\/)/.test(item.href)
      ? item.href
      : undefined;
    return [{ label, ...(href ? { href } : {}) }];
  }).slice(0, 3);
}

function parseStreamEvent(line: string): StreamEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(value) || typeof value.type !== "string") return null;

  if (value.type === "delta" && typeof value.text === "string") {
    return { type: "delta", text: value.text };
  }
  if (value.type === "meta" || value.type === "done") {
    return {
      type: value.type,
      suggestions: normalizeSuggestions(value.suggestions),
    };
  }
  if (value.type === "error") return { type: "error" };
  return null;
}

function isAbortError(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (error instanceof DOMException && error.name === "AbortError");
}

type XiaoyaShellProps = {
  locale: XiaoyaLocale;
};

export function XiaoyaShell({ locale }: XiaoyaShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const copy = xiaoyaCopy[locale];
  const titleId = useId();
  const descriptionId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [failedMessage, setFailedMessage] = useState<string | null>(null);
  const [responseSuggestions, setResponseSuggestions] = useState<XiaoyaSuggestion[] | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const activeRequestRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const requestSequenceRef = useRef(0);
  const search = searchParams.toString();

  const pageContext = useMemo(
    () => mapXiaoyaPageContext(pathname, search, locale),
    [locale, pathname, search],
  );
  const pageSuggestions = useMemo(
    () => getXiaoyaSuggestions(pageContext.pageType, locale),
    [locale, pageContext.pageType],
  );
  const suggestions = responseSuggestions?.length ? responseSuggestions : pageSuggestions;
  const hiddenRoute = pathname === "/meditations/orders" || pathname.includes("/admin");
  const compactLauncher = pathname === "/phil-coach";

  const stopStream = useCallback(() => {
    activeRequestRef.current?.controller.abort();
    activeRequestRef.current = null;
    setIsStreaming(false);
  }, []);

  const closeDialog = useCallback(() => {
    stopStream();
    setIsOpen(false);
  }, [stopStream]);

  useEffect(() => {
    setResponseSuggestions(null);
  }, [pathname, search]);

  useEffect(() => {
    if (!hiddenRoute || !isOpen) return;
    closeDialog();
  }, [closeDialog, hiddenRoute, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const launcher = launcherRef.current;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => inputRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("hidden"));
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      launcher?.focus();
    };
  }, [closeDialog, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    endRef.current?.scrollIntoView({ block: "end" });
  }, [isOpen, isStreaming, messages]);

  useEffect(() => () => activeRequestRef.current?.controller.abort(), []);

  async function runChat(messageText: string, appendUser: boolean) {
    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;
    activeRequestRef.current?.controller.abort();
    const controller = new AbortController();
    activeRequestRef.current = { id: requestId, controller };

    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: "user",
      content: messageText,
    };
    const assistantId = createMessageId();
    const requestHistory = appendUser ? [...messages, userMessage] : messages;

    setFailedMessage(null);
    setResponseSuggestions(null);
    setIsStreaming(true);
    setMessages((current) => [
      ...(appendUser ? [...current, userMessage] : current),
      { id: assistantId, role: "assistant", content: "" },
    ]);

    try {
      const response = await fetch("/api/xiaoya/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: requestHistory
            .filter((message) => message.content.trim())
            .slice(-12)
            .map(({ role, content }) => ({ role, content })),
          pageContext,
          locale,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) throw new Error("xiaoya-request-failed");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamFailed = false;

      const handleLine = (line: string) => {
        const event = parseStreamEvent(line);
        if (!event) return;
        if (event.type === "error") {
          streamFailed = true;
          return;
        }
        if (event.type === "delta" && event.text) {
          setMessages((current) => current.map((message) => (
            message.id === assistantId
              ? { ...message, content: message.content + event.text }
              : message
          )));
        }
        if ((event.type === "meta" || event.type === "done") && event.suggestions?.length) {
          setResponseSuggestions(event.suggestions);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        lines.map((line) => line.trim()).filter(Boolean).forEach(handleLine);
        if (streamFailed) {
          await reader.cancel();
          throw new Error("xiaoya-stream-failed");
        }
        if (done) break;
      }
      if (buffer.trim()) handleLine(buffer.trim());
      if (streamFailed) throw new Error("xiaoya-stream-failed");
    } catch (error) {
      if (isAbortError(error, controller.signal)) {
        setMessages((current) => current.filter(
          (message) => message.id !== assistantId || message.content.trim(),
        ));
      } else {
        setMessages((current) => current.filter((message) => message.id !== assistantId));
        setFailedMessage(messageText);
      }
    } finally {
      if (activeRequestRef.current?.id === requestId) {
        activeRequestRef.current = null;
        setIsStreaming(false);
      }
    }
  }

  function submitMessage(messageText: string) {
    const normalized = messageText.trim();
    if (!normalized || isStreaming) return;
    setDraft("");
    void runChat(normalized, true);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitMessage(draft);
  }

  function handleInputKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitMessage(draft);
    }
  }

  function handleSuggestion(suggestion: XiaoyaSuggestion) {
    if (suggestion.href) {
      router.push(suggestion.href);
      closeDialog();
      return;
    }
    submitMessage(suggestion.label);
  }

  function clearConversation() {
    stopStream();
    setMessages([]);
    setDraft("");
    setFailedMessage(null);
    setResponseSuggestions(null);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  if (hiddenRoute) return null;

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={copy.launcher}
        tabIndex={isOpen ? -1 : undefined}
        onClick={() => setIsOpen(true)}
        className={`fixed right-4 z-[80] flex h-14 items-center justify-center gap-2.5 rounded-full border border-[#91aa91]/55 bg-[#f7f4eb]/95 px-3 text-[#244a35] shadow-[0_12px_38px_rgba(18,47,31,0.22)] backdrop-blur-md transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#315d43] motion-reduce:transform-none motion-reduce:transition-none sm:bottom-6 sm:right-6 ${compactLauncher ? "w-14" : "sm:h-[58px] sm:px-4"} ${isOpen ? "pointer-events-none invisible" : ""} bottom-[max(1rem,env(safe-area-inset-bottom))]`}
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#315d43] text-[#dbead3]">
          <XiaoyaSprout className="h-7 w-7" />
        </span>
        {!compactLauncher && (
          <span className="hidden pr-1 text-sm font-semibold tracking-[0.08em] sm:inline">
            {copy.launcher}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[150] sm:bg-[#15291e]/25 sm:backdrop-blur-[2px]">
          <button
            type="button"
            aria-label={copy.close}
            className="absolute inset-0 hidden cursor-default sm:block"
            onClick={closeDialog}
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            className="fixed inset-0 flex h-[100dvh] w-full flex-col overflow-hidden bg-[#f7f4eb] text-[#243229] shadow-[0_24px_80px_rgba(18,42,28,0.28)] sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[min(760px,calc(100dvh-48px))] sm:w-[400px] sm:rounded-[28px] sm:border sm:border-[#93a68f]/45"
          >
            <p id={descriptionId} className="sr-only">
              {copy.welcomeBody}
            </p>
            <header className="shrink-0 border-b border-[#315d43]/12 bg-[#edf1e7] px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:pt-4">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#315d43] text-[#dbead3]">
                  <XiaoyaSprout className="h-8 w-8" thinking={isStreaming} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id={titleId} className="text-lg font-semibold tracking-[0.08em]">
                    {copy.title}
                  </h2>
                  <p className="mt-0.5 text-xs text-[#647269]">
                    {copy.subtitle} · {copy.presence} 🌱
                  </p>
                </div>
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={clearConversation}
                    className="rounded-full px-3 py-2 text-xs text-[#486153] transition hover:bg-white/75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315d43] motion-reduce:transition-none"
                  >
                    {copy.clear}
                  </button>
                )}
                <button
                  type="button"
                  aria-label={copy.close}
                  onClick={closeDialog}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-2xl font-light text-[#486153] transition hover:bg-white/75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315d43] motion-reduce:transition-none"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            </header>

            <div
              role="log"
              aria-live="polite"
              aria-relevant="additions text"
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5"
            >
              {messages.length === 0 ? (
                <section className="rounded-[24px] border border-[#80917d]/25 bg-white/65 p-5">
                  <h3 className="font-serif text-2xl text-[#24412f]">{copy.welcomeTitle}</h3>
                  <p className="mt-4 text-sm leading-7 text-[#4f6056]">
                    {copy.welcomeBody}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-[#6a756e]">{copy.welcomeHint}</p>
                </section>
              ) : (
                <div className="space-y-5">
                  {messages.map((message) => (
                    <article
                      key={message.id}
                      className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div className={`max-w-[88%] ${message.role === "user" ? "text-right" : "text-left"}`}>
                        <p className="mb-1.5 px-1 text-[11px] tracking-[0.18em] text-[#7a857e]">
                          {message.role === "user" ? copy.userName : copy.assistantName}
                        </p>
                        <p className={`whitespace-pre-wrap rounded-[22px] px-4 py-3 text-left text-[15px] leading-7 ${
                          message.role === "user"
                            ? "bg-[#d99a7e] text-[#2d211c]"
                            : "border border-[#81917e]/25 bg-white/75 text-[#33453a]"
                        }`}>
                          {message.content || (isStreaming ? "…" : "")}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {failedMessage && (
                <div role="alert" className="mt-5 rounded-2xl border border-[#c9856d]/35 bg-[#fff3ec] p-4 text-sm text-[#744b3e]">
                  <p className="leading-6">{copy.error}</p>
                  <button
                    type="button"
                    onClick={() => void runChat(failedMessage, false)}
                    className="mt-3 rounded-full border border-[#b97a63]/45 px-4 py-2 font-medium transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8a5746] motion-reduce:transition-none"
                  >
                    {copy.retry}
                  </button>
                </div>
              )}

              {!isStreaming && suggestions.length > 0 && (
                <section className="mt-6" aria-label={copy.suggestionsLabel}>
                  <p className="mb-2 text-[11px] font-semibold tracking-[0.18em] text-[#758078]">
                    {copy.suggestionsLabel}
                  </p>
                  <div className="flex flex-col items-start gap-2">
                    {suggestions.map((suggestion) => (
                      <button
                        key={`${suggestion.label}-${suggestion.href ?? "ask"}`}
                        type="button"
                        onClick={() => handleSuggestion(suggestion)}
                        className="rounded-full border border-[#6f876f]/30 bg-[#eef2e9] px-4 py-2.5 text-left text-sm leading-5 text-[#31523d] transition hover:border-[#54705a]/55 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315d43] motion-reduce:transition-none"
                      >
                        {suggestion.label}{suggestion.href ? " ↗" : ""}
                      </button>
                    ))}
                  </div>
                </section>
              )}
              <div ref={endRef} />
            </div>

            <form
              onSubmit={handleSubmit}
              className="shrink-0 border-t border-[#315d43]/12 bg-[#f7f4eb] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5 sm:pb-5"
            >
              <label htmlFor={`${titleId}-input`} className="sr-only">
                {copy.inputLabel}
              </label>
              <textarea
                ref={inputRef}
                id={`${titleId}-input`}
                value={draft}
                rows={2}
                maxLength={1800}
                disabled={isStreaming}
                placeholder={copy.inputPlaceholder}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleInputKeyDown}
                className="min-h-16 w-full resize-none rounded-2xl border border-[#758676]/35 bg-white/75 px-4 py-3 text-base leading-6 outline-none transition placeholder:text-[#8d968f] focus:border-[#315d43]/70 focus:ring-2 focus:ring-[#315d43]/10 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <p aria-live="polite" className="text-xs text-[#7b867f]">
                  {isStreaming ? copy.thinking : `${draft.length}/1800`}
                </p>
                {isStreaming ? (
                  <button
                    type="button"
                    onClick={stopStream}
                    className="inline-flex min-w-24 items-center justify-center gap-2 rounded-full border border-[#9f6b59]/45 bg-[#fff3ec] px-5 py-2.5 text-sm font-semibold text-[#754838] transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8a5746] motion-reduce:transition-none"
                  >
                    <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[2px] bg-current" />
                    {copy.stop}
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!draft.trim()}
                    className="min-w-24 rounded-full bg-[#315d43] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#254532] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315d43] disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
                  >
                    {copy.send}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
