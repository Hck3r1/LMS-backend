const vm = require('vm');

function runInSandbox(code, entry, args = []) {
  const context = {
    console: { log: () => {} },
    Math,
    Date,
    JSON
  };
  const sandbox = vm.createContext(context);
  const wrapped = `${code}\n;typeof ${entry}==='function' ? ${entry} : undefined;`;
  const script = new vm.Script(wrapped, { timeout: 1000 });
  const fn = script.runInContext(sandbox, { timeout: 1000 });
  if (typeof fn !== 'function') throw new Error('Entry function not found');
  const result = fn.apply(null, args);
  return result;
}

function gradeCode({ code, entry, tests = [] }) {
  const results = [];
  let passed = 0;
  for (const t of tests) {
    try {
      const out = runInSandbox(code, entry, t.args || []);
      const ok = JSON.stringify(out) === JSON.stringify(t.expected);
      if (ok) passed += 1;
      results.push({ ok, output: out, expected: t.expected });
    } catch (e) {
      results.push({ ok: false, error: e.message });
    }
  }
  const percentage = tests.length ? Math.round((passed / tests.length) * 100) : 0;
  return { passed, total: tests.length, percentage, results };
}

module.exports = { gradeCode };


