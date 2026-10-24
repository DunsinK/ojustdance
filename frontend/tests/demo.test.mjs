import { test } from "node:test";
import assert from "node:assert/strict";
import { DemoController } from "../src/demo/controller.ts";
test("complete round requires readiness; supports next opponent and rematch", () => {
  const demo = new DemoController();
  try {
    demo.dispatch("find");
    assert.equal(demo.getSnapshot().phase, "searching");
    demo.skip();
    assert.equal(demo.getSnapshot().phase, "found");
    demo.skip();
    assert.equal(demo.getSnapshot().phase, "preview");
    demo.skip();
    assert.equal(demo.getSnapshot().phase, "preview");
    assert.equal(demo.getSnapshot().remainingMs, 0);
    demo.dispatch("ready");
    assert.equal(demo.getSnapshot().phase, "countdown");
    demo.skip();
    assert.equal(demo.getSnapshot().phase, "battle");
    demo.skip();
    assert.equal(demo.getSnapshot().phase, "results");
    assert.ok(demo.getSnapshot().players[0].feedback);
    assert.equal(
      demo.getSnapshot().result.scores.you,
      demo.getSnapshot().players[0].score,
    );
    demo.dispatch("rematch");
    assert.equal(demo.getSnapshot().phase, "found");
    demo.dispatch("next");
    assert.equal(demo.getSnapshot().phase, "searching");
    assert.equal(demo.getSnapshot().players[0].score, 0);
    assert.equal(demo.getSnapshot().players[0].feedback, undefined);
  } finally {
    demo.dispose();
  }
});
test("cancellation, connection recovery, and subscription cleanup", () => {
  const demo = new DemoController();
  let calls = 0;
  const unsubscribe = demo.subscribe(() => calls++);
  try {
    demo.dispatch("find");
    demo.dispatch("cancel");
    assert.equal(demo.getSnapshot().phase, "home");
    demo.setConnection("disconnected");
    assert.equal(demo.getSnapshot().connection, "disconnected");
    demo.dispatch("retry");
    assert.equal(demo.getSnapshot().connection, "connected");
    demo.setConnection("error");
    assert.ok(demo.getSnapshot().error);
    demo.dispatch("leave");
    assert.equal(demo.getSnapshot().error, undefined);
    unsubscribe();
    const previous = calls;
    demo.dispatch("find");
    assert.equal(calls, previous);
  } finally {
    demo.dispose();
  }
});
