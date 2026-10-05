const crypto = require('node:crypto');
const fs = require('node:fs');

function validateCertificate(certPath, domain) {
  const certificate = new crypto.X509Certificate(fs.readFileSync(certPath));
  if (!domain || !certificate.checkHost(domain)) throw new Error('El certificado no corresponde a SSL_DOMAIN.');
  const now = Date.now();
  if (now < Date.parse(certificate.validFrom) || now >= Date.parse(certificate.validTo)) throw new Error('El certificado SSL no esta vigente.');
  return certificate;
}

function authentication(env = process.env) {
  const username = env.WEBDAV_USERNAME;
  const password = env.WEBDAV_PASSWORD;
  if (env.NODE_ENV === 'production' && (!username || !password || password.length < 24)) {
    throw new Error('Configura credenciales privadas WEBDAV_USERNAME/WEBDAV_PASSWORD (minimo 24 caracteres).');
  }
  return (req, res, next) => {
    if (!username || !password) return next();
    const expected = crypto.createHash('sha256').update(`${username}:${password}`).digest();
    const header = req.headers.authorization || '';
    const actual = crypto.createHash('sha256').update(header.startsWith('Basic ') ? Buffer.from(header.slice(6), 'base64') : '').digest();
    if (header.startsWith('Basic ') && crypto.timingSafeEqual(expected, actual)) return next();
    res.setHeader('WWW-Authenticate', 'Basic realm="SAFRAV WebDAV", charset="UTF-8"');
    return res.status(401).end();
  };
}
module.exports = { authentication, validateCertificate };
