import { createServer } from 'http';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const m = require('aedes'); const Aedes = m.Aedes ?? m.default ?? m;
const wsStream = require('websocket-stream');
const broker = typeof Aedes.createBroker === 'function' ? await Aedes.createBroker() : new Aedes();
const server = createServer(); wsStream.createServer({ server }, broker.handle);
server.listen(18883, () => console.log('broker up'));
