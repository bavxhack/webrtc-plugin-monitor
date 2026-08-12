const test = require("node:test");
const assert = require("node:assert/strict");

function loadController(overrides = {}) {
  delete require.cache[require.resolve("../src/action-controller.js")];
  const listeners = {};
  global.chrome = {
    action: { onClicked: { addListener(listener) { listeners.clicked = listener; } } },
    runtime: { getURL: path => `chrome-extension://test/${path}` },
    windows: {
      create: overrides.create || (async () => ({ id: 42 })),
      update: overrides.update || (async () => ({})),
      onRemoved: { addListener(listener) { listeners.removed = listener; } }
    }
  };
  const controller = require("../src/action-controller.js");
  return { controller, listeners };
}

test("toolbar click opens popup.html in a popup window", async () => {
  let options;
  const { controller, listeners } = loadController({ create: async value => { options = value; return { id: 42 }; } });
  controller.install();
  listeners.clicked({ id: 123 });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(options, { url: "chrome-extension://test/popup.html?tabId=123", type: "popup", width: 380, height: 590, focused: true });
});

test("subsequent click focuses the existing popup window", async () => {
  let creates = 0, focusedId;
  const { controller } = loadController({ create: async () => { creates++; return { id: 7 }; }, update: async id => { focusedId = id; } });
  await controller.openPopupWindow();
  await controller.openPopupWindow();
  assert.equal(creates, 1);
  assert.equal(focusedId, 7);
});

test.afterEach(() => { delete global.chrome; });
