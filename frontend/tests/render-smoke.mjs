// Component/contract smoke checks. This is not browser or layout verification.
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
const folder = await mkdtemp(join(tmpdir(), "ojustdance-render-"));
try {
  const output = join(folder, "render.cjs");
  await build({
    stdin: {
      contents: `
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import assert from 'node:assert/strict';
      import { App } from './src/App';
      import { Matchmaking, matchmakingState } from './src/screens/Matchmaking';
      import { DemoController } from './src/demo/controller';
      const controller = new DemoController();
      const base = controller.getSnapshot();
      const result = { winnerId: 'you', scores: { you: 9240, opponent: 8610 }, accuracy: 94, bestCombo: 18, perfectMoves: 24 };
      const states = ['home', 'searching', 'found', 'preview', 'countdown', 'battle', 'results'].map(phase => ({ ...base, phase, result: phase === 'results' ? result : null }));
      states.push({ ...base, phase: 'battle', connection: 'disconnected' }, { ...base, phase: 'preview', connection: 'error', error: 'Test error' });
      states.push(...['searching', 'found'].flatMap(phase => ['connecting', 'disconnected', 'error'].map(connection => ({ ...base, phase, connection, demo: false }))));
      assert.equal(matchmakingState({ ...base, phase: 'searching', connection: 'connected' }), 'searching', 'transport connection is not a confirmed match');
      assert.equal(matchmakingState({ ...base, phase: 'found', connection: 'connecting' }), 'connecting');
      assert.equal(matchmakingState(base, true), 'cancelled');
      const cancelled = renderToStaticMarkup(<Matchmaking game={base} renderers={{ Video: () => null, Choreography: () => null }} cameraControl={null} cancelled onCancel={() => {}}/>);
      assert.match(cancelled, /Search has stopped|search has stopped/);
      assert.ok(!cancelled.includes('BEFORE THE BEAT DROPS'));
      for (const state of states) {
        const adapter = { getSnapshot: () => state, subscribe: () => () => {}, dispatch: () => {} };
        const html = renderToStaticMarkup(<App adapter={adapter}/>);
        assert.match(html, /ojustdance/);
        assert.equal((html.match(/<h1[ >]/g) || []).length, 1, state.phase + ': exactly one page heading');
        assert.match(html, /Skip to content/);
        assert.ok(!html.includes('NaN'));
        if (state.phase === 'searching' && state.connection === 'connecting') {
          assert.match(html, /No opponent has been confirmed yet/);
          assert.ok(!html.includes('ONE SHARED BEAT'));
        }
        if (state.phase === 'found' && state.connection === 'connecting') assert.match(html, /Same room/);
        if (state.phase === 'battle' && state.connection === 'connected') {
          assert.match(html, /THE COACH/);
          assert.match(html, /Upcoming choreography moves/);
          assert.ok(!html.includes('PERFECT'), 'feedback must not be invented by a view');
        }
        console.log('Render OK:', state.phase, state.connection);
      }
      const empty = { ...base, phase: 'preview', choreography: null, demo: false };
      const html = renderToStaticMarkup(<App adapter={{ getSnapshot: () => empty, subscribe: () => () => {}, dispatch: () => {} }}/>);
      assert.match(html, /Waiting for a shared routine/);
      console.log('Render OK: empty choreography / real-mode placeholders');
      controller.dispose();
    `,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: output,
    jsx: "automatic",
    logLevel: "silent",
  });
  process.stdout.write(
    execFileSync(process.execPath, [output], { encoding: "utf8" }),
  );
} finally {
  await rm(folder, { recursive: true, force: true });
}
