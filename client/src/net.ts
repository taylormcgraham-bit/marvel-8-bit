import { ServerMsg, type ClientMsg, type GameEvent } from "@shared/events";

export interface NetHandlers {
  onHello(mode: "live" | "mock", replay: GameEvent[]): void;
  onEvents(events: GameEvent[]): void;
  onStatus(text: string): void;
}

export class Net {
  private ws?: WebSocket;
  private handlers: NetHandlers;
  private retry = 1000;

  constructor(handlers: NetHandlers) { this.handlers = handlers; this.connect(); }

  private connect() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => { this.retry = 1000; this.send({ kind: "ready" }); };
    ws.onmessage = (ev) => {
      const parsed = ServerMsg.safeParse(JSON.parse(ev.data));
      if (!parsed.success) { console.warn("bad server message", parsed.error); return; }
      const m = parsed.data;
      if (m.kind === "hello") this.handlers.onHello(m.mode, m.replay);
      else if (m.kind === "events") this.handlers.onEvents(m.events);
      else this.handlers.onStatus(m.text);
    };
    ws.onclose = () => {
      this.handlers.onStatus("engine disconnected; reconnecting");
      setTimeout(() => this.connect(), this.retry);
      this.retry = Math.min(this.retry * 2, 15000);
    };
  }

  send(msg: ClientMsg) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg)); }
}
