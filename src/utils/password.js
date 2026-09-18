const argon2 = require('argon2');

// OWASP-interactive profile: memory-hard, resistant to GPU/ASIC attacks.
// Isolated behind two functions so swapping the hash algorithm (e.g. to
// bcrypt if native-build issues arise on the deploy target) is a one-file
// change that touches nothing else.
const HASH_OPTIONS = {
  type: argon2.argon2id,
  timeCost: 2,
  memoryCost: 65536, // 64 MiB
  parallelism: 1,
  hashLength: 32,
};

async function hashPassword(plain) {
  return argon2.hash(plain, HASH_OPTIONS);
}

async function verifyPassword(hash, plain) {
  try {
    return await argon2.verify(hash, plain);
  } catch (err) {
    // Malformed hash or verification error — treat as failed verification,
    // never throw.
    return false;
  }
}

module.exports = { hashPassword, verifyPassword };
