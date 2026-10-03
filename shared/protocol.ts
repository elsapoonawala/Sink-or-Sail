// Messages exchanged between the browser and the game server.

export const SIGNALS = [
  { key: "fuel", label: "Need fuel" },
  { key: "medicine", label: "Need medicine" },
  { key: "tools", label: "Need tools" },
  { key: "trade", label: "Trade?" },
  { key: "ready", label: "Ready to leave" },
  { key: "distrust", label: "Don't trust it" },
  { key: "yes", label: "Yes" },
  { key: "no", label: "No" },
] as const;

export type SignalKey = (typeof SIGNALS)[number]["key"];

export interface ChatMessage {
  id: string;
  /** Empty for messages from the game itself. */
  from: string;
  text: string;
  at: number;
}

export interface SignalMessage {
  from: string;
  key: SignalKey;
  at: number;
}

export interface VoiceState {
  on: boolean;
  muted: boolean;
}

export type ClientAction =
  | { type: "settings"; quick?: boolean; wrecker?: "auto" | "on" | "off" }
  | { type: "addBot" }
  | { type: "kick"; target: string }
  | { type: "start" }
  | { type: "lobby" }
  | { type: "pick"; place: string }
  | { type: "done"; done?: boolean }
  | { type: "ready"; ready?: boolean }
  | { type: "load"; cardId: string }
  | { type: "offer"; to: string; give: { cardIds: string[]; pearls: number }; want: { kinds: Record<string, number>; pearls: number } }
  | { type: "respond"; offerId: string; accept: boolean }
  | { type: "cancel"; offerId: string };

export interface JoinResult {
  code?: string;
  pid?: string;
  token?: string;
  error?: string;
}
