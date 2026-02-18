const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { verifyMessageSignature } = require('@stacks/encryption');

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const JWT_EXPIRY = '24h';
const CHALLENGE_TTL = 5 * 60 * 1000; // 5 minutes

const challenges = new Map(); // address → { nonce, expires }

// C32 encoding for Stacks address derivation (inline, no extra dep)
const C32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function c32encode(hexStr) {
  let res = '';
  let carry = 0;
  let carryBits = 0;
  for (let i = hexStr.length - 2; i >= 0; i -= 2) {
    const b = parseInt(hexStr.slice(i, i + 2), 16);
    const bits = carry | (b << carryBits);
    res = C32[bits & 0x1f] + res;
    if (carryBits + 3 >= 5) res = C32[(bits >> 5) & 0x1f] + res;
    carryBits = (carryBits + 3) % 5;
    carry = b >> (5 - carryBits);
  }
  if (carryBits > 0) res = C32[carry & 0x1f] + res;
  return res;
}

function c32checkEncode(version, hash160Hex) {
  const versionBuf = Buffer.from([version]);
  const hash160Buf = Buffer.from(hash160Hex, 'hex');
  const checksumInput = Buffer.concat([versionBuf, hash160Buf]);
  const h1 = crypto.createHash('sha256').update(checksumInput).digest();
  const h2 = crypto.createHash('sha256').update(h1).digest();
  const checksum = h2.slice(0, 4).toString('hex');
  const encoded = c32encode(hash160Hex + checksum);
  return 'S' + C32[version] + encoded;
}

function pubkeyToStxAddress(pubkeyHex) {
  const pubBuf = Buffer.from(pubkeyHex, 'hex');
  const sha256 = crypto.createHash('sha256').update(pubBuf).digest();
  const hash160 = crypto.createHash('ripemd160').update(sha256).digest();
  const hash160Hex = hash160.toString('hex');
  return {
    mainnet: c32checkEncode(22, hash160Hex), // SP...
    testnet: c32checkEncode(26, hash160Hex), // ST...
  };
}

module.exports = {
  generateChallenge(address) {
    const nonce = [
      'Sign this message to authenticate with Visual Audio Groove Codec.',
      '',
      `Address: ${address}`,
      `Nonce: ${crypto.randomBytes(16).toString('hex')}`,
      `Timestamp: ${Date.now()}`,
    ].join('\n');
    challenges.set(address, { nonce, expires: Date.now() + CHALLENGE_TTL });
    return nonce;
  },

  async verifyChallenge(address, signature, publicKey) {
    const challenge = challenges.get(address);
    if (!challenge || Date.now() > challenge.expires) return false;

    // Verify the public key corresponds to the claimed address
    const derived = pubkeyToStxAddress(publicKey);
    if (derived.mainnet !== address && derived.testnet !== address) {
      console.warn(`Address mismatch: claimed=${address} derived=${JSON.stringify(derived)}`);
      return false;
    }

    // Verify the signature
    let valid = false;
    try {
      valid = verifyMessageSignature({ message: challenge.nonce, signature, publicKey });
    } catch (e) {
      console.error('Signature verification error:', e.message);
      return false;
    }

    if (valid) challenges.delete(address);
    return valid;
  },

  signToken(address) {
    return jwt.sign({ address }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
  },

  verifyToken(token) {
    try {
      const { address } = jwt.verify(token, JWT_SECRET);
      return address;
    } catch {
      return null;
    }
  },

  requireAuth(req, res, next) {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const address = module.exports.verifyToken(token);
    if (!address) return res.status(401).json({ error: 'Invalid token' });
    req.address = address;
    next();
  },
};
