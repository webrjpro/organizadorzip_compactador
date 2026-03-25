import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

const REQUIRED_MODULES = [
  'src/core/app-core.js',
  'src/tools/report/report-app.js',
  'src/tools/csv/csv-app.js'
];

const checks = [
  {
    name: 'index.html references physical JS modules',
    run() {
      const html = readFileSync('index.html', 'utf-8');
      assert.match(html, /<script src="\.\/src\/core\/app-core\.js"><\/script>/);
      assert.match(html, /<script src="\.\/src\/tools\/report\/report-app\.js"><\/script>/);
      assert.match(html, /<script src="\.\/src\/tools\/csv\/csv-app\.js"><\/script>/);
    }
  },
  {
    name: 'physical JS modules exist',
    run() {
      for (const filePath of REQUIRED_MODULES) {
        assert.equal(existsSync(filePath), true, `Expected module file: ${filePath}`);
      }
    }
  },
  {
    name: 'physical JS modules pass syntax check',
    run() {
      for (const filePath of REQUIRED_MODULES) {
        const source = readFileSync(filePath, 'utf-8');
        assert.doesNotThrow(
          () => new vm.Script(source, { filename: filePath }),
          `Syntax check failed for ${filePath}`
        );
      }
    }
  }
];

let failures = 0;
for (const check of checks) {
  try {
    check.run();
    process.stdout.write(`PASS: ${check.name}\n`);
  } catch (error) {
    failures += 1;
    process.stderr.write(`FAIL: ${check.name}\n${error.stack}\n`);
  }
}

if (failures > 0) {
  process.stderr.write(`\nSmoke finished with ${failures} failure(s).\n`);
  process.exit(1);
}

process.stdout.write('\nSmoke finished successfully.\n');
