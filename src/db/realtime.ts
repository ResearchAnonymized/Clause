type Handler = (payload?: { new?: unknown; old?: unknown; eventType?: string }) => void;

type Sub = {
  table: string;
  filter?: string;
  handler: Handler;
};

/**
 * Lightweight polling stand-in for Supabase Realtime channels.
 * Keeps existing `.channel().on("postgres_changes"...).subscribe()` call sites working.
 */
export class PollChannel {
  private subs: Sub[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private intervalMs: number;

  constructor(
    private name: string,
    intervalMs = 2000,
  ) {
    this.intervalMs = intervalMs;
  }

  on(
    _event: "postgres_changes",
    cfg: { event?: string; schema?: string; table: string; filter?: string },
    handler: Handler,
  ) {
    this.subs.push({ table: cfg.table, filter: cfg.filter, handler });
    return this;
  }

  subscribe() {
    if (this.timer) return this;
    const tick = () => {
      for (const s of this.subs) {
        try {
          // Polling has no row payload — callers must tolerate missing `new`/`old`
          // and typically just invalidate React Query caches.
          s.handler({ eventType: "*", new: undefined, old: undefined });
        } catch (err) {
          console.warn(`[realtime:${this.name}] handler error`, err);
        }
      }
    };
    this.timer = setInterval(tick, this.intervalMs);
    setTimeout(tick, 250);
    return this;
  }

  unsubscribe() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.subs = [];
  }
}

const channels = new Map<string, PollChannel>();

export function createChannel(name: string) {
  const existing = channels.get(name);
  if (existing) existing.unsubscribe();
  const ch = new PollChannel(name);
  channels.set(name, ch);
  return ch;
}

export function removeChannel(ch: PollChannel) {
  ch.unsubscribe();
  for (const [name, value] of channels) {
    if (value === ch) channels.delete(name);
  }
}
