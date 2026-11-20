// Loaded with `node --import` before the tests: lets them import app modules the way the
// bundler does, without file extensions (see ts-hooks.mjs).
import { register } from 'node:module';

register('./ts-hooks.mjs', import.meta.url);
