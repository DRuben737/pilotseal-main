import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(fs.readFileSync("lib/notification-device-policy.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
vm.runInThisContext(`(function(module,exports){${source}\n})`)(mod, mod.exports);
const { notificationPermissionLabel } = mod.exports;

test("permission refusal and unsupported devices have actionable labels", () => {
  assert.equal(notificationPermissionLabel({ supported: false, permission: "unsupported", enabled: false }), "Not supported on this device.");
  assert.equal(notificationPermissionLabel({ supported: true, permission: "denied", enabled: false }), "Blocked in browser settings.");
});

test("granted permission distinguishes an active subscription from a revoked subscription", () => {
  assert.equal(notificationPermissionLabel({ supported: true, permission: "granted", enabled: true }), "Alerts when PilotSeal is not open.");
  assert.equal(notificationPermissionLabel({ supported: true, permission: "granted", enabled: false }), "Ready to enable on this device.");
});
