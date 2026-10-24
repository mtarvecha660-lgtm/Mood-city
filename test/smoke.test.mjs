// Static smoke test: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

test('page basics', () => {
    assert.match(html, /<title>Mood Shift City/);
    assert.match(html, /name="viewport" content="width=device-width/);
});

test('every local script and stylesheet exists', () => {
    const refs = [...html.matchAll(/(?:src|href)="((?:js|css)\/[^"?]+)/g)].map(m => m[1]);
    assert.ok(refs.length >= 10, 'expected the game scripts and styles');
    for (const r of refs) assert.ok(existsSync(join(root, r)), 'missing ' + r);
});

test('new systems are wired in', () => {
    for (const id of ['callout', 'perk-modal', 'combo-meter', 'mute-btn-hud', 'menu-level', 'skin-name']) {
        assert.ok(html.includes(`id="${id}"`), 'missing #' + id);
    }
    const order = ['js/state.js', 'js/toon.js', 'js/juice.js', 'js/game.js'].map(f => html.indexOf(f));
    assert.deepEqual([...order].sort((a, b) => a - b), order, 'scripts must load state → toon → juice → game');
    const game = readFileSync(join(root, 'js/game.js'), 'utf8');
    for (const hook of ['Juice.onKill', 'Juice.onHit', 'Juice.onWaveCleared', 'Juice.showGameOver', 'Toon.buildWorld', 'Toon.makeEnemy']) {
        assert.ok(game.includes(hook), 'game.js lost hook ' + hook);
    }
});

test('no leftover placeholders', () => {
    assert.doesNotMatch(html, /TODO|lorem ipsum|\{\{/i);
});
