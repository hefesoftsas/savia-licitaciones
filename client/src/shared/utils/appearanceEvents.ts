export interface AppearanceChange {
  ui_language?: 'es' | 'en';
  ui_theme?: 'light' | 'dark' | 'system';
  ui_opportunity_detail?: 'dialog' | 'drawer';
  ui_style?: 'vega' | 'nova' | 'maia' | 'lyra' | 'mira';
  ui_color_theme?: 'neutral' | 'blue' | 'green' | 'violet' | 'rose';
}
const channelName = 'app-appearance';

/** Ephemeral notification only; Electron config remains the source of truth. */
export function publishAppearance(change: AppearanceChange) {
  const channel = new BroadcastChannel(channelName);
  channel.postMessage(change);
  channel.close();
}

export function subscribeAppearance(receive: (change: AppearanceChange) => void) {
  const channel = new BroadcastChannel(channelName);
  channel.onmessage = (event: MessageEvent<AppearanceChange>) => receive(event.data);
  return () => channel.close();
}
