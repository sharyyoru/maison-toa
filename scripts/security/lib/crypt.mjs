/**
 * Authenticated encryption for backup artifacts.
 *
 * Format:  [ ciphertext ][ magic "MTSEC01" ][ salt 32 ][ iv 12 ][ tag 16 ]
 *
 * AES-256-GCM, key derived with scrypt. The tag is in the trailer rather than
 * the header so the ciphertext can be written as a single pass from a stream
 * (pg_dump output is far too large to buffer).
 *
 * A truncated, reordered, or tampered file fails authentication on decrypt.
 */
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';

export const MAGIC = 'MTSEC01';
export const TRAILER_LEN = 7 + 32 + 12 + 16;
// N=2^15, r=8 needs 128*N*r = 32 MiB, which is exactly Node's default
// `maxmem` ceiling and therefore throws. Raise the ceiling explicitly.
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function deriveKey(passphrase, salt) {
  return crypto.scryptSync(passphrase, salt, 32, SCRYPT);
}

/**
 * Pipes `source` through gzip then AES-256-GCM into `outFile`, appending the
 * trailer. Returns size and digest of the finished artifact.
 */
export async function encryptStreamToFile(source, outFile, passphrase) {
  const salt = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);

  await pipeline(source, zlib.createGzip({ level: 9 }), cipher, fs.createWriteStream(outFile));

  fs.appendFileSync(outFile, Buffer.concat([
    Buffer.from(MAGIC), salt, iv, cipher.getAuthTag(),
  ]));

  const buf = fs.readFileSync(outFile);
  return {
    size: buf.length,
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
  };
}

/** Reverses encryptStreamToFile. Throws on wrong passphrase or tampering. */
export function decryptFile(file, passphrase) {
  const blob = fs.readFileSync(file);
  if (blob.length <= TRAILER_LEN) throw new Error('file too short to be a valid artifact');

  const trailer = blob.subarray(blob.length - TRAILER_LEN);
  if (trailer.subarray(0, 7).toString() !== MAGIC) {
    throw new Error('bad magic — not a backup artifact, or truncated');
  }

  const salt = trailer.subarray(7, 39);
  const iv = trailer.subarray(39, 51);
  const tag = trailer.subarray(51, 67);
  const payload = blob.subarray(0, blob.length - TRAILER_LEN);

  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
  decipher.setAuthTag(tag);

  let gz;
  try {
    gz = Buffer.concat([decipher.update(payload), decipher.final()]);
  } catch {
    throw new Error('authentication failed — wrong passphrase or the file was altered');
  }
  return zlib.gunzipSync(gz);
}
