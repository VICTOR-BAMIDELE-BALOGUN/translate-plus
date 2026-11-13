// acts as a third phone: sends one spoken "call" phrase into a room
import { createRequire } from 'module';
const Paho = createRequire('/home/claude/translate-plus/package.json')('paho-mqtt');
const { deriveRoom, seal } = await import('/home/claude/translate-plus/src/services/codec.ts');
const keys = deriveRoom(process.argv[2]);
const c = new Paho.Client('ws://127.0.0.1:18883/mqtt', 'tp-inject');
c.connect({ useSSL: false, onSuccess: () => {
  c.send(keys.topic, seal({ id: 'call-1', from: 'phone-3', name: 'Giulia', kind: 'call', text: 'Pronto, chi parla?', lang: 'it', ts: Date.now() }, keys.key), 1, false);
  c.send(keys.topic, seal({ id: 'bad-1', from: 'phone-3', name: 'X', kind: 'chat', text: 'wrong key', ts: Date.now() }, deriveRoom('AAAA-BBBB-CCCC-DDDD').key), 1, false);
  setTimeout(() => { c.disconnect(); process.exit(0); }, 400);
}});
