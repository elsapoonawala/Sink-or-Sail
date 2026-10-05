// Messages exchanged between the browser and the game server.

export const SIGNALS = [
  { key: "fuel", label: "Need fuel" },
  { key: "medicine", label: "Need medicine" },
  { key: "tools", label: "Need tools" },
  { key: "come", label: "Over here!" },
  { key: "trade", label: "Trade?" },
  { key: "pier", label: "To the pier!" },
  { key: "distrust", label: "Watch the gangway" },
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

/** Compact positions sent ten times a second: [id, x, y, dir*100, flags]. flags: 1 moving, 2 mounted, 4 busy, 8 knocked out. */
export type PosTuple = [string, number, number, number, number];
export interface PosMessage {
  t: number;
  p: PosTuple[];
}

export type ClientAction =
  | { type: "settings"; quick?: boolean; wrecker?: "auto" | "on" | "off" }
  | { type: "addBot" }
  | { type: "fill" }
  | { type: "kick"; target: string }
  | { type: "start" }
  | { type: "lobby" }
  | { type: "role"; role: string | null }
  | { type: "drop"; itemId: string }
  | { type: "mount" }
  | { type: "dive" }
  | { type: "barter"; kind: string }
  | { type: "lamp" }
  | { type: "dump" }
  | { type: "ready"; ready?: boolean }
  | { type: "strike"; target: string }
  | { type: "enter" }
  | { type: "leave" }
  | { type: "accuse"; target: string }
  | { type: "vote"; yes: boolean }
  | { type: "offer"; to: string; give: { itemIds: string[]; pearls: number }; want: { kinds: Record<string, number>; pearls: number } }
  | { type: "respond"; offerId: string; accept: boolean }
  | { type: "cancel"; offerId: string };

export interface JoinResult {
  code?: string;
  pid?: string;
  token?: string;
  error?: string;
}
