// Finite read/control client. No caller-selected protocol methods or parameters.
import { observerLimits as limits, UnsupportedObservation } from './original-observer-contract.mjs';
import { requireValue, ReleaseError } from '../vitest-release/files.mjs';

export class ObserverProtocol {
  #socket; #next = 0; #pending = new Map(); #queue = []; #waiters = [];
  #messages = 0; #bytes = 0; #failure = null; #intentionalClose = false;
  constructor(endpoint, scriptUrl) {
    const parsed = new URL(endpoint);
    requireValue(parsed.protocol === 'ws:' && parsed.hostname === '127.0.0.1' && /^\d+$/.test(parsed.port) &&
      Number(parsed.port) > 0 && !parsed.username && !parsed.password && !parsed.search && !parsed.hash &&
      /^\/[a-f0-9-]{36}$/.test(parsed.pathname), 'Unsupported fixture Inspector endpoint');
    this.scriptUrl = scriptUrl;
    this.#socket = new WebSocket(endpoint);
    this.opened = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.fail('timeout'); reject(new UnsupportedObservation('timeout', 'Observer connection timeout')); }, limits.operationMs);
      this.#socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.#socket.addEventListener('error', () => { clearTimeout(timer); this.fail('disconnect'); reject(new UnsupportedObservation('disconnect', 'Observer connection failed')); }, { once: true });
    });
    this.#socket.addEventListener('close', () => { if (!this.#intentionalClose) this.fail('disconnect'); });
    this.#socket.addEventListener('message', event => {
      try {
        requireValue(typeof event.data === 'string', 'Unknown Inspector message encoding');
        const size = Buffer.byteLength(event.data); this.#bytes += size;
        requireValue(++this.#messages <= limits.messages && size <= limits.messageBytes && this.#bytes <= limits.protocolBytes,
          'Inspector protocol bounds exceeded');
        const message = JSON.parse(event.data);
        requireValue(message && typeof message === 'object' && !Array.isArray(message), 'Invalid Inspector message object');
        if ('id' in message) {
          const pending = this.#pending.get(message.id);
          requireValue(pending, 'Late/replayed Inspector response');
          this.#pending.delete(message.id); clearTimeout(pending.timer);
          if (message.error) pending.reject(new UnsupportedObservation('protocol', 'Unsupported Inspector protocol operation'));
          else pending.resolve(message.result ?? {});
          return;
        }
        requireValue(typeof message.method === 'string' && message.params && typeof message.params === 'object', 'Unknown Inspector notification');
        if (message.method === 'Debugger.scriptParsed' && message.params.url !== this.scriptUrl) return;
        if (!['Debugger.scriptParsed', 'Debugger.breakpointResolved', 'Debugger.paused', 'Debugger.resumed'].includes(message.method)) {
          throw new UnsupportedObservation('protocol', 'Unsupported Inspector notification');
        }
        if (message.method === 'Debugger.resumed') return;
        requireValue(this.#queue.length < 64, 'Inspector event queue exceeded');
        const waiter = this.#waiters.shift();
        if (waiter) { clearTimeout(waiter.timer); waiter.resolve(message); }
        else this.#queue.push(message);
      } catch (error) { this.fail(error instanceof ReleaseError || error instanceof SyntaxError ? 'protocol' : error); }
    });
  }
  fail(reason) {
    if (this.#failure) return;
    this.#failure = typeof reason === 'string' ? new UnsupportedObservation(reason, `Observer ${reason}`) : reason;
    for (const pending of this.#pending.values()) { clearTimeout(pending.timer); pending.reject(this.#failure); }
    this.#pending.clear();
    for (const waiter of this.#waiters.splice(0)) { clearTimeout(waiter.timer); waiter.reject(this.#failure); }
  }
  get failure() { return this.#failure instanceof UnsupportedObservation ? this.#failure.reason : null; }
  async #request(method, params = {}) {
    if (this.#failure) throw this.#failure;
    if (++this.#next > limits.commands) throw new UnsupportedObservation('bounds', 'Observer command bound exceeded');
    const id = this.#next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.fail('timeout'); }, limits.operationMs);
      this.#pending.set(id, { resolve, reject, timer });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async enable() { await this.opened; return this.#request('Debugger.enable', { maxScriptsCacheSize: limits.messageBytes }); }
  async breakpoint(location) {
    return this.#request('Debugger.setBreakpointByUrl', { url: this.scriptUrl,
      lineNumber: location.lineNumber, columnNumber: location.columnNumber });
  }
  async source(scriptId) {
    requireValue(typeof scriptId === 'string' && /^[0-9]{1,12}$/.test(scriptId), 'Unknown Inspector script identity');
    return this.#request('Debugger.getScriptSource', { scriptId });
  }
  async possible(scriptId, location) {
    return this.#request('Debugger.getPossibleBreakpoints', { start: { scriptId, ...location },
      end: { scriptId, lineNumber: location.lineNumber, columnNumber: location.columnNumber + 1 } });
  }
  async start() { return this.#request('Runtime.runIfWaitingForDebugger'); }
  async resume() { return this.#request('Debugger.resume'); }
  async notification() {
    if (this.#failure) throw this.#failure;
    if (this.#queue.length) return this.#queue.shift();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail('timeout'), limits.operationMs);
      this.#waiters.push({ resolve, reject, timer });
    });
  }
  close() {
    this.#intentionalClose = true; this.fail('disconnect');
    if (this.#socket.readyState === WebSocket.OPEN || this.#socket.readyState === WebSocket.CONNECTING) this.#socket.close();
  }
  get counts() { return { commands: this.#next, messages: this.#messages, bytes: this.#bytes }; }
}
