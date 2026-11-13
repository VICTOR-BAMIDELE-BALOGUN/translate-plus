// Encrypted rooms over a free public MQTT relay. No account and no server of our own:
// two phones that share a room code meet on a topic derived from that code.
import Paho from 'paho-mqtt';
import { deriveRoom, open, seal, type RoomKeys } from './codec';
import { getSettings, getState, newId } from '../store';

export type Wire = {
  id: string;
  from: string;
  name: string;
  kind: 'chat' | 'call' | 'hello' | 'here' | 'call-join' | 'call-leave';
  text?: string;
  lang?: string;
  ts: number;
};

export type RoomStatus = 'connecting' | 'online' | 'offline';

type Handlers = {
  onStatus: (s: RoomStatus) => void;
  onMessage: (m: Wire) => void;
};

export class RoomConnection {
  private client: Paho.Client | null = null;
  private keys: RoomKeys;
  private closed = false;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private ping: ReturnType<typeof setInterval> | null = null;
  private attempts = 0;

  constructor(code: string, private handlers: Handlers) {
    this.keys = deriveRoom(code);
    this.connect();
  }

  private connect() {
    if (this.closed) return;
    this.handlers.onStatus('connecting');
    const clientId = 'tp-' + getState().deviceId.slice(0, 10) + '-' + newId().slice(-6);
    let client: Paho.Client;
    try {
      client = new Paho.Client(getSettings().brokerUrl, clientId);
    } catch {
      this.handlers.onStatus('offline');
      return;
    }
    this.client = client;
    client.onConnectionLost = () => {
      if (this.client !== client) return;
      this.handlers.onStatus('offline');
      this.scheduleRetry();
    };
    client.onMessageArrived = (message) => {
      const wire = open<Wire>(message.payloadString, this.keys.key);
      if (!wire || typeof wire.id !== 'string' || wire.from === getState().deviceId) return;
      this.handlers.onMessage(wire);
    };
    client.connect({
      timeout: 8,
      keepAliveInterval: 30,
      cleanSession: true,
      useSSL: getSettings().brokerUrl.startsWith('wss'),
      onSuccess: () => {
        if (this.closed || this.client !== client) return;
        this.attempts = 0;
        client.subscribe(this.keys.topic, { qos: 1 });
        this.handlers.onStatus('online');
        this.send('hello');
      },
      onFailure: () => {
        if (this.client !== client) return;
        this.handlers.onStatus('offline');
        this.scheduleRetry();
      },
    });
    if (!this.ping) this.ping = setInterval(() => this.send('here'), 25000);
  }

  private scheduleRetry() {
    if (this.closed) return;
    if (this.retry) clearTimeout(this.retry);
    const delay = Math.min(1000 * 2 ** this.attempts++, 15000);
    this.retry = setTimeout(() => this.connect(), delay);
  }

  send(kind: Wire['kind'], text?: string, lang?: string): Wire | null {
    const wire: Wire = {
      id: newId(),
      from: getState().deviceId,
      name: getSettings().displayName || 'Me',
      kind,
      text,
      lang,
      ts: Date.now(),
    };
    try {
      if (!this.client || !this.client.isConnected()) return kind === 'chat' || kind === 'call' ? null : wire;
      const reliable = kind === 'chat' || kind === 'call';
      this.client.send(this.keys.topic, seal(wire, this.keys.key), reliable ? 1 : 0, false);
      return wire;
    } catch {
      return null;
    }
  }

  close() {
    this.closed = true;
    if (this.retry) clearTimeout(this.retry);
    if (this.ping) clearInterval(this.ping);
    try {
      if (this.client?.isConnected()) this.client.disconnect();
    } catch {}
    this.client = null;
  }
}
