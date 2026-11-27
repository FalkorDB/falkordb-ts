import { describe, it, afterAll, expect } from '@jest/globals';
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const SCRIPT = join(__dirname, '..', 'scripts', 'falkordb-image.sh');

const dir = mkdtempSync(join(tmpdir(), 'falkordb-image-'));

const run = (args: Array<string>, tags?: Array<string> | null, path?: string) => {
    const env = { ...process.env };
    delete env.FALKORDB_TAGS_FILE;
    if (path) env.PATH = `${path}:${env.PATH}`;
    if (tags !== undefined) {
        // null stands for Docker Hub being unreachable
        env.FALKORDB_TAGS_FILE = join(dir, tags === null ? 'missing' : `tags-${Math.random()}`);
        if (tags) writeFileSync(env.FALKORDB_TAGS_FILE, tags.join('\n') + '\n');
    }
    const { status, stdout, stderr } = spawnSync('bash', [SCRIPT, ...args], { env, encoding: 'utf8' });
    return { status, stdout: stdout.trim(), stderr };
};

describe('scripts/falkordb-image.sh', () => {
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    describe('4', () => {
        it('picks the newest release, comparing versions as numbers', () => {
            expect(run(['4'], ['v4.9.0', 'v4.22.5', 'v4.10.0', 'v4.2.1', 'v4.22.10'])).toMatchObject({
                status: 0, stdout: 'v4.22.10',
            });
        });

        it('skips suffixed builds and other tags', () => {
            const tags = ['v4.22.5', 'v4.22.6-alpine', 'v4.22.6-x64', 'v4.22.6-rhel9-x64', 'v4.30', 'v4.30.0rc1', 'v40.1.0'];
            expect(run(['4'], tags)).toMatchObject({ status: 0, stdout: 'v4.22.5' });
        });

        it('falls back to a pinned release when a later page of tags fails', () => {
            // A curl that serves the first page, which links to a second, and
            // fails on the second
            const bin = join(dir, 'bin');
            mkdirSync(bin, { recursive: true });
            const page = JSON.stringify({ results: [{ name: 'v4.99.0' }], next: 'https://hub.docker.com/next?page=2' });
            writeFileSync(join(bin, 'curl'), [
                '#!/usr/bin/env bash',
                'for url; do :; done',
                'case $url in *page=2*) exit 22 ;; esac',
                `echo '${page}'`,
            ].join('\n') + '\n', { mode: 0o755 });

            const result = run(['4'], undefined, bin);
            expect(result).toMatchObject({ status: 0, stdout: 'v4.22.5' });
            expect(result.stderr).toMatch(/::warning::/);
        });

        it('falls back to a pinned release, with a warning, when no tag can be listed', () => {
            for (const tags of [null, [], ['v4.22.6-alpine']]) {
                const result = run(['4'], tags);
                expect(result).toMatchObject({ status: 0, stdout: 'v4.22.5' });
                expect(result.stderr).toMatch(/::warning::/);
            }
        });
    });

    it('uses latest for 6 and edge for edge', () => {
        expect(run(['6'])).toMatchObject({ status: 0, stdout: 'latest' });
        expect(run(['edge'])).toMatchObject({ status: 0, stdout: 'edge' });
    });

    it('rejects an unknown line', () => {
        expect(run(['5']).status).toBe(2);
        expect(run([]).status).toBe(2);
    });

    describe('--check', () => {
        it.each([
            ['4', '42205'],
            ['6', '60004'],
            ['6', '60201'],
            // edge reports a placeholder
            ['edge', '999999'],
        ])('accepts line %s running graph module %s', (line, version) => {
            expect(run(['--check', line, version]).status).toBe(0);
        });

        it.each([
            ['4', '60201'],
            ['6', '42205'],
            // latest moving to 7.0 must not silently move the 6.x leg
            ['6', '70000'],
            ['edge', '42205'],
            ['6', 'abc'],
        ])('rejects line %s running graph module %s', (line, version) => {
            const result = run(['--check', line, version]);
            expect(result.status).toBe(1);
            expect(result.stderr).toMatch(/::error::/);
        });

        it('rejects an unknown line', () => {
            expect(run(['--check', '5', '50000']).status).toBe(2);
        });
    });
});
