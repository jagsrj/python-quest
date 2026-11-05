import { loadPyodide } from 'pyodide';
import fs from 'fs';
import vm from 'vm';

const src = new URL('./src/', import.meta.url).pathname;
const py = await loadPyodide();
py.runPython(fs.readFileSync(src + 'engine.py', 'utf8'));
const pqRun = py.globals.get('pq_run');
const run = (code, inputs = [], seed = 1) => JSON.parse(pqRun(code, py.toPy(inputs.map(String)), seed));

const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(src + 'lessons.js', 'utf8') + '\nthis.LESSONS = LESSONS; this.H = H;', ctx);

function T(code) {
  return {
    code,
    async run(inputs = [], seed = 1) {
      const r = run(code, inputs, seed);
      if (r.err) throw { msg: 'ERR ' + JSON.stringify(r.err) };
      if (r.need !== null) throw { msg: 'NEED INPUT ' + r.need };
      return r;
    }
  };
}
async function check(part, code) {
  try { return await part.check(T(code)); } catch (e) { return { ok: false, msg: e.msg || String(e) }; }
}

let fail = 0;
for (const L of ctx.LESSONS) {
  for (const k of ['main', 'bonus']) {
    const p = L[k];
    const good = await check(p, p.solution);
    const starter = await check(p, p.starter);
    const tag = `${L.id}.${k}`;
    if (!good.ok) { fail++; console.log('FAIL solution', tag, good.msg); }
    if (starter.ok) { fail++; console.log('FAIL starter passes', tag); }
  }
  for (const s of L.learn) if (s.code) {
    const r = run(s.code, ['Ava', '12', '1.5', '5'], 1);
    if (r.err || r.need !== null) console.log('  learn', L.id, '|', s.title, '->', r.err ? r.err.type + ': ' + r.err.msg : 'needs input');
  }
}
// engine spot checks
console.log(JSON.stringify(run('from turtle import *\ncircle(50)').turtle.ops.length), 'circle segments');
console.log(run('x = 1\nprint(x +)').err);
console.log(run('print("a" + 1)').err);
console.log(run('print(1)\n  print(2)').err);
console.log(run('n = input("Name? ")\nprint("hi", n)', ['Ava']).out);
console.log(fail ? `${fail} FAILURES` : 'ALL PASS');
