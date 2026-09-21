const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getExtraAllowedDomains,
  matchesAllowedDomain,
  isOriginInAllowedDomains,
  isOriginAllowed,
} = require('../allowedOrigins');

const STATIC = ['orvix.blog', 'orvix.fun', 'localhost:3000'];

const withEnv = (value, run) => {
  const previous = process.env.ORVIX_ALLOWED_ORIGINS;
  if (value === undefined) delete process.env.ORVIX_ALLOWED_ORIGINS;
  else process.env.ORVIX_ALLOWED_ORIGINS = value;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.ORVIX_ALLOWED_ORIGINS;
    else process.env.ORVIX_ALLOWED_ORIGINS = previous;
  }
};

test('aucune liste configurée : les domaines en dur fonctionnent (comportement historique)', () => {
  withEnv(undefined, () => {
    assert.deepEqual(getExtraAllowedDomains(), []);
    assert.equal(isOriginAllowed('https://orvix.fun', STATIC), true);
    assert.equal(isOriginAllowed('https://www.orvix.fun', STATIC), true);
    assert.equal(isOriginAllowed('http://localhost:3000', STATIC), true);
    assert.equal(isOriginAllowed('https://orvix.fr', STATIC), false);
  });
});

test('un domaine propre déclaré dans ORVIX_ALLOWED_ORIGINS est accepté', () => {
  withEnv('orvix.fr,www.orvix.fr', () => {
    assert.deepEqual(getExtraAllowedDomains(), ['orvix.fr', 'www.orvix.fr']);
    assert.equal(isOriginAllowed('https://orvix.fr', STATIC), true);
    assert.equal(isOriginAllowed('https://www.orvix.fr', STATIC), true);
    // Comme la liste en dur historique, une entrée simple couvre les
    // sous-domaines du domaine déclaré…
    assert.equal(isOriginAllowed('https://admin.orvix.fr', STATIC), true);
    // …mais pas un domaine d'une autre famille.
    assert.equal(isOriginAllowed('https://orvix.com', STATIC), false);
    // Les domaines en dur ne sont jamais perdus.
    assert.equal(isOriginAllowed('https://orvix.fun', STATIC), true);
  });
});

test('un point en tête autorise tous les sous-domaines', () => {
  withEnv('.orvix.fr', () => {
    assert.equal(isOriginAllowed('https://orvix.fr', STATIC), true);
    assert.equal(isOriginAllowed('https://api.orvix.fr', STATIC), true);
    assert.equal(isOriginAllowed('https://a.b.orvix.fr', STATIC), true);
    // Le suffixe ne doit pas matcher un domaine qui se termine par le même texte.
    assert.equal(isOriginAllowed('https://fauxorvix.fr', STATIC), false);
  });
});

test('une entrée avec port se compare à l’hôte complet', () => {
  withEnv('localhost:5173,127.0.0.1:8080', () => {
    assert.equal(isOriginAllowed('http://localhost:5173', STATIC), true);
    assert.equal(isOriginAllowed('http://localhost:9999', STATIC), false);
    assert.equal(isOriginAllowed('http://127.0.0.1:8080', STATIC), true);
  });
});

test('les espaces, majuscules et entrées vides sont tolérés', () => {
  withEnv(' ORVIX.FR , ,www.orvix.fr ', () => {
    assert.deepEqual(getExtraAllowedDomains(), ['orvix.fr', 'www.orvix.fr']);
    assert.equal(isOriginAllowed('https://orvix.fr', STATIC), true);
  });
});

test('`*` ouvre tout (déconseillé hors développement)', () => {
  withEnv('*', () => {
    assert.equal(isOriginAllowed('https://n-importe-quoi.tld', STATIC), true);
  });
});

test('les entrées invalides ne font pas planter la comparaison', () => {
  withEnv('orvix.fr', () => {
    assert.equal(matchesAllowedDomain('', 'orvix.fr'), false);
    assert.equal(matchesAllowedDomain('https://orvix.fr', ''), false);
    assert.equal(matchesAllowedDomain('pas une url', 'orvix.fr'), false);
    assert.equal(isOriginInAllowedDomains(null, ['orvix.fr']), false);
    assert.equal(isOriginInAllowedDomains('https://orvix.fr', []), false);
  });
});

test('un referer complet (avec chemin) est comparé sur son hôte', () => {
  withEnv('orvix.fr', () => {
    assert.equal(
      isOriginAllowed('https://orvix.fr/watch/movie/123', STATIC),
      true,
    );
  });
});
