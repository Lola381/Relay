import bcrypt from 'bcryptjs';

// bcryptjs is pure JS (no native build on Windows). Cost 12 ≈ 200–300 ms per hash.
const BCRYPT_ROUNDS = 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, BCRYPT_ROUNDS);

export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);
