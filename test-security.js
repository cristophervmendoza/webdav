const test = require('node:test');
const assert = require('node:assert/strict');
const { authentication } = require('./security');
test('Produccion rechaza credenciales ausentes o debiles', () => {
  assert.throws(() => authentication({ NODE_ENV:'production' }));
  assert.throws(() => authentication({ NODE_ENV:'production', WEBDAV_USERNAME:'office', WEBDAV_PASSWORD:'short' }));
});
test('GET/PUT/PROPFIND solo avanzan con la credencial correcta', () => {
  const password='test-only-random-long-password';
  const middleware=authentication({ NODE_ENV:'production',WEBDAV_USERNAME:'office',WEBDAV_PASSWORD:password });
  for (const method of ['GET','PUT','PROPFIND']) for (const credential of [null,'wrong',`office:${password}`]) {
    let passed=false, status=0, challenge='';
    const req={method,headers:credential ? {authorization:`Basic ${Buffer.from(credential).toString('base64')}`} : {}};
    const res={setHeader(k,v){challenge=v},status(s){status=s;return this},end(){}};
    middleware(req,res,()=>{passed=true});
    assert.equal(passed,credential===`office:${password}`);
    if (!passed) {assert.equal(status,401);assert.match(challenge,/Basic/);}
  }
});
