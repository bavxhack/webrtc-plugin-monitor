const test = require("node:test");
const assert = require("node:assert/strict");

function loadController(overrides = {}) {
  delete require.cache[require.resolve("../src/action-controller.js")];
  const calls = [];
  global.chrome = {
    sidePanel: {
      setPanelBehavior: overrides.setPanelBehavior || (async options => { calls.push(options); })
    }
  };
  const controller = require("../src/action-controller.js");
  return { calls, controller };
}

test("toolbar click is configured to open the persistent side panel", async () => {
  const { calls, controller } = loadController();
  await controller.install();
  assert.deepEqual(calls, [{ openPanelOnActionClick: true }]);
});

test.afterEach(() => { delete global.chrome; });
