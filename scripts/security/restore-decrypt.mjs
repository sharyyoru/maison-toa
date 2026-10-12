#!/usr/bin/env node
/**
 * Decrypts a backup produced by backup.mjs. A backup you have never restored
 * is not a backup — run this with --verify-only on every dump you take.
 *
 * Usage:
 *   node scripts/security/restore-decrypt.mjs <file.sql.gz.enc> [--out dump.sql] [--verify-only]
 */
import fs from 'node:fs';
import { require_ } from './lib/env.mjs';
import { decryptFile } from './lib/crypt.mjs';

const file = process.argv[2];
if (!file || file.startsWith('--')) {
  console.error('usage: restore-decrypt.mjs <file.sql.gz.enc> [--out dump.sql] [--verify-only]');
  process.exit(2);
}

const verifyOnly = process.argv.includes('--verify-only');
const outIdx = process.argv.indexOf('--out');
const outFile = outIdx > -1 ? process.argv[outIdx + 1] : file.replace(/\.gz\.enc$/, '');

const passphrase = require_('BACKUP_PASSPHRASE', 'Must match the passphrase used to create the dump.');

let sql;
try {
  sql = decryptFile(file, passphrase);
} catch (e) {
  console.error(`FAILED: ${e.message}`);
  process.exit(1);
}

console.log(`Authenticated OK. Plaintext SQL: ${(sql.length / 1048576).toFixed(2)} MiB`);
console.log(`First line: ${sql.subarray(0, 200).toString().split('\n')[0]}`);

if (verifyOnly) {
  console.log('--verify-only: nothing written.');
} else {
  fs.writeFileSync(outFile, sql);
  console.log(`Wrote ${outFile}`);
  console.warn('WARNING: that file is UNENCRYPTED patient data. Delete it when done.');
}
