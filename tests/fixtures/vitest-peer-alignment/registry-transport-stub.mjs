// Owned offline transport double. No network, credentials or repository URLs.
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { pathToFileURL } from 'node:url';
const [source, scenario] = process.argv.slice(2);
const metrics = { requests: [], maxActive: 0, destroyed: 0, active: 0 };
https.get = (url, options, callback) => {
  const req = new EventEmitter(); let closed = false;
  const close = (destroyed = false) => {
    if (closed) return; closed = true; metrics.active--;
    if (destroyed) metrics.destroyed++;
    setImmediate(() => req.emit('close'));
  };
  req.destroy = () => close(true);
  metrics.requests.push({ url, options }); metrics.active++;
  metrics.maxActive = Math.max(metrics.maxActive, metrics.active);
  const index = metrics.requests.length;
  if (scenario === 'timeout') return req;
  setTimeout(() => {
    if (closed) return;
    if (scenario === 'request-error' && index === 1) { req.emit('error', new Error('modeled transport failure')); close(); return; }
    const res = new EventEmitter(); res.destroy = () => close(true);
    res.statusCode = scenario === 'redirect' ? 302 : scenario === 'non200' ? 404 : 200;
    callback(res);
    if (closed) return;
    const coordinate = url.split('/').slice(-2).map(decodeURIComponent);
    const doc = { name: coordinate[0], version: coordinate[1],
      dist: { integrity: 'sha512-' + 'A'.repeat(86) + '==', tarball: 'https://ignored.invalid/package.tgz' },
      dependencies: { example: '^1.0.0' }, optionalDependencies: { companion: '~1.0.0' },
      peerDependencies: { vitest: '4.1.11' }, peerDependenciesMeta: { vitest: { optional: true } },
      scripts: { install: 'never execute' }, repository: 'ignored projection data' };
    if (scenario === 'wrong-name') doc.name = 'wrong-name';
    if (scenario === 'wrong-version') doc.version = '9.0.0';
    let bytes = Buffer.from(JSON.stringify(doc));
    if (scenario === 'invalid-utf8') bytes = Buffer.from([0xff]);
    if (scenario === 'malformed-json') bytes = Buffer.from('{');
    if (scenario === 'duplicate-json') bytes = Buffer.from('{"name":"one","name":"two"}');
    if (scenario === 'oversized') bytes = Buffer.alloc(1024 * 1024 + 1, 32);
    if (scenario === 'aggregate') {
      doc.padding = '';
      doc.padding = 'x'.repeat(1024 * 1024 - Buffer.byteLength(JSON.stringify(doc)));
      bytes = Buffer.from(JSON.stringify(doc));
    }
    if (scenario === 'response-error') { res.emit('error', new Error('modeled response failure')); close(); return; }
    res.emit('data', bytes);
    if (!closed) { res.emit('end'); close(); }
  }, index === 1 ? 2 : 4);
  return req;
};
syncBuiltinESMExports();
const { acquireRegistryMetadata } = await import(pathToFileURL(source).href);
let requests = Array.from({ length: scenario === 'aggregate' ? 20 : 12 }, (_, i) =>
  ({ name: i === 0 ? '@vitest/modeled-package' : 'fixture-package-' + i, version: '1.0.0' }));
if (scenario === 'request-count') requests = Array.from({ length: 4097 }, (_, i) => ({ name: 'fixture-package-' + i, version: '1.0.0' }));
if (scenario === 'duplicate-coordinates') requests = [requests[0], requests[0]];
if (scenario === 'request-url') requests = [{ ...requests[0], url: 'https://untrusted.invalid' }];
if (scenario === 'invalid-coordinate') requests = [{ name: '../../escape', version: '1.0.0' }];
const started = performance.now(); let output;
try { output = { state: 'fulfilled', envelope: await acquireRegistryMetadata(requests) }; }
catch (error) { output = { state: 'rejected', code: error.code, message: error.message }; }
await new Promise((done) => setImmediate(done));
process.stdout.write(JSON.stringify({ ...output, durationMs: performance.now() - started, metrics }) + '\n');
