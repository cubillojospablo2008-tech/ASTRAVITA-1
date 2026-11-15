const fs = require('fs'), vm = require('vm');
const kbText = fs.readFileSync('src/kb.json', 'utf8');
const ctx = {console, Math, Date, JSON, Intl, Object, Array, Number, String, Set, Map, Promise, URLSearchParams, setTimeout,
  document: {getElementById: id => id === 'astravita-kb' ? {textContent: kbText} : null, createElement: () => ({getContext: () => ({})})},
  crypto: {randomUUID: () => Math.random().toString(36).slice(2)}, btoa: s => s, atob: s => s};
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['core.js', 'engine.js', 'demo.js']) vm.runInContext(fs.readFileSync('src/js/' + f, 'utf8'), ctx, {filename: f});
const D = ctx.ASTRAVITA.demo;
const kinds = ['stable', 'stress', 'fatigue', 'recovery', 'isolation', 'lowsignal'];
kinds.forEach((k, i) => {
  const h = D.history(k, 'x', 1000 + i * 7919);
  const s = h.sessions, last = s[s.length - 1];
  const counts = {}; s.forEach(x => counts[x.result.status] = (counts[x.result.status] || 0) + 1);
  console.log(k.padEnd(10), s.length, JSON.stringify(counts), '| last:', last.result.status, last.result.findings.length, last.result.findings.slice(0, 5).map(f => f.id + ':' + f.score).join(' '), last.questionnaire ? 'Q' : '-');
  if (process.argv[2] === k) { const f = last.result.findings[0]; console.log(JSON.stringify(f.contributions, null, 0)); console.log(JSON.stringify(last.features)); console.log(JSON.stringify(last.baseline_used)); }
});
