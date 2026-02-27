import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const SALT_LENGTH = 32;
const KEY_LENGTH = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

/**
 * Hash password using scrypt (Node.js native, no external deps).
 * Format: base64(salt):base64(hash)
 */
export async function hashPassword(password: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const salt = randomBytes(SALT_LENGTH);
        scrypt(password, salt, KEY_LENGTH, SCRYPT_PARAMS, (err, derivedKey) => {
            if (err) return reject(err);
            resolve(`${salt.toString('base64')}:${derivedKey.toString('base64')}`);
        });
    });
}

/**
 * Verify password against stored hash using timing-safe comparison.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        const [saltB64, hashB64] = storedHash.split(':');
        if (!saltB64 || !hashB64) return resolve(false);

        const salt = Buffer.from(saltB64, 'base64');
        const storedKey = Buffer.from(hashB64, 'base64');

        scrypt(password, salt, KEY_LENGTH, SCRYPT_PARAMS, (err, derivedKey) => {
            if (err) return reject(err);
            resolve(timingSafeEqual(storedKey, derivedKey));
        });
    });
}
