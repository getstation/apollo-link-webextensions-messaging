export interface Event<T extends Function> {
  addListener(callback: T): void;
  removeListener(callback: T): void;
}

export type PortDisconnectEvent = Event<(port: MessagingPort) => void>
export type PortMessageEvent = Event<(message: Record<string, unknown>, port: MessagingPort) => void>

export interface MessagingPort {
  postMessage: (message: Record<string, unknown>) => void;
  onDisconnect: PortDisconnectEvent;
  onMessage: PortMessageEvent;
}
