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
      import { MemoryRouter } from 'react-router-dom';
      import assert from 'node:assert/strict';
      import { App } from './src/App';
      import { matchmakingState } from './src/screens/Matchmaking';
      const players = [
        { id: 'player-a', name: 'You', color: 'cobalt', score: null, ready: false },
        { id: 'player-b', name: 'Player 2', color: 'coral', score: null, ready: true }
      ];
      const chart = {
        id: 'sample', title: 'Foundation Steps', artist: 'ojustdance · sample chart',
        bpm: 120, difficulty: 'Easy', durationMs: 30000, previewDurationMs: 30000,
        sample: true, moves: [{ id: 'step-1', name: 'Side step', startMs: 0, durationMs: 30000 }]
      };
      const base = {
        phase: 'home', connection: 'connected', players: [players[0], null],
        choreography: null, remainingMs: 0, elapsedMs: 0, result: null
      };
      const active = { ...base, players, choreography: chart, remainingMs: 30000 };
      const result = {
        winnerId: null, scores: { 'player-a': null, 'player-b': null },
        accuracy: null, bestCombo: null, perfectMoves: null
      };
      const states = ['home', 'searching', 'found', 'preview', 'countdown', 'battle', 'results']
        .map(phase => ({
          ...active, phase,
          result: phase === 'results' ? result : null,
          remainingMs: phase === 'battle' ? 30000 : active.remainingMs
        }));
      states.push(
        { ...active, phase: 'searching', players: [players[0], null], connection: 'disconnected', error: 'Opponent disconnected.' },
        { ...active, phase: 'battle', connection: 'error', error: 'Server unavailable.' },
        { ...active, phase: 'searching', players: [players[0], null] }
      );
      assert.equal(matchmakingState(states[1]), 'searching');
      assert.equal(matchmakingState({ ...active, phase: 'found' }), 'found');
      const renderApp = adapter => renderToStaticMarkup(
        <MemoryRouter><App adapter={adapter}/></MemoryRouter>
      );
      for (const state of states) {
        const adapter = { getSnapshot: () => state, subscribe: () => () => {}, dispatch: () => {} };
        const html = renderApp(adapter);
        assert.match(html, /ojustdance/);
        assert.equal((html.match(/<h1[ >]/g) || []).length, 1, state.phase + ': exactly one page heading');
        assert.match(html, /Skip to content/);
        assert.ok(!html.includes('NaN'));
        if (state.phase === 'searching' && state.connection === 'connected') {
          assert.match(html, /Looking for a dance partner/);
          assert.ok(!html.includes('PLAYER 02'));
        }
        if (state.phase === 'battle' && state.connection === 'connected') {
          assert.match(html, /POSE SCORING NOT CONNECTED/);
          assert.match(html, /Upcoming choreography moves/);
          assert.match(html, /Score unavailable/);
          assert.ok(!html.includes('PERFECT'), 'feedback must not be invented by a view');
        }
        if (state.phase === 'results') {
          assert.match(html, /Scoring comes next/);
          assert.match(html, /NO SCORE/);
          assert.ok(!html.includes('WORTHY RIVAL'));
        }
        console.log('Render OK:', state.phase, state.connection);
      }
      const empty = { ...base, phase: 'preview' };
      const emptyHtml = renderApp({ getSnapshot: () => empty, subscribe: () => () => {}, dispatch: () => {} });
      assert.match(emptyHtml, /Waiting for a shared routine/);
      console.log('Render OK: no chart available');
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
