/**
 * =============================================================================
 *  strength.test.js — TESTS UNITAIRES DU MOTEUR DE VERIFICATION
 * =============================================================================
 *
 *  COMMENT LANCER LES TESTS (depuis la racine du projet) :
 *
 *      node --test tests/                          (Node 22 / 23 / 24)
 *      node --test tests/*.test.js                 (toutes versions, y compris Node 25+)
 *
 *  ATTENTION : a partir de Node 25, les arguments de --test sont interpretes
 *  comme des motifs de FICHIERS ; un simple nom de dossier n'est plus explore.
 *  Sur Node 25+, utiliser l'une de ces formes :
 *
 *      node --test                                 (explore tout le projet)
 *      node --test tests/*.test.js
 *      node --test tests/strength.test.js          (ce fichier uniquement)
 *
 *  Variantes utiles :
 *      node --test --test-reporter=spec tests/*.test.js   (rapport detaille)
 *      node --test --watch tests/*.test.js                (relance a la sauvegarde)
 *
 *  Aucune dependance npm : on utilise le lanceur de tests INTEGRE a Node
 *  (node:test) et les assertions strictes de node:assert/strict.
 *  Node >= 22 requis (detection automatique des modules ES).
 *
 * -----------------------------------------------------------------------------
 *  RAPPEL DU CAHIER DES CHARGES (la specification que ces tests verifient) :
 *
 *    Faible     : par defaut / moins de 8 caracteres / un seul type de caractere
 *    Moyen      : longueur >= 8  ET au moins 2 types
 *    Fort       : longueur >= 12 ET au moins 3 types
 *    Tres fort  : longueur >= 16 ET les 4 types
 *
 *    Les 4 types sont : minuscules, majuscules, chiffres, caracteres speciaux.
 *    L'evaluation se fait DU PLUS FORT AU PLUS FAIBLE : le premier niveau dont
 *    toutes les conditions sont remplies gagne.
 * =============================================================================
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONFIG,
  TYPE_IDS,
  detectTypes,
  codePointLength,
  classify,
  computeScore,
  analyzePassword,
  isCommonPassword,
  generateStrongPassword,
  COMMON_PASSWORDS,
  getCriteria,
  findCriterion,
  activeTypeIds,
  setCriterion,
  setLevelGap,
  resetCriteria,
  isDefaultCriteria,
  exportSettings,
  importSettings,
} from '../miniapp/strength.js';

/* =============================================================================
 * OUTILS PARTAGES / helpers
 * ========================================================================== */

/** Niveau officiel d'un mot de passe, en une ligne. */
const niveau = (mdp) => analyzePassword(mdp).level;

/** Recupere l'objet niveau declare dans CONFIG.LEVELS a partir de son identifiant. */
const palier = (id) => CONFIG.LEVELS.find((l) => l.id === id);

/** Nombre de types de caracteres presents (0..4). */
const nbTypes = (mdp) => analyzePassword(mdp).typesCount;

/**
 * Specification de reference, re-implementee ici volontairement a la main :
 * si le moteur derive du cahier des charges, la comparaison echoue.
 */
function niveauAttenduSelonSpec(longueur, typesCount) {
  if (longueur >= 16 && typesCount >= 4) return 'tres_fort';
  if (longueur >= 12 && typesCount >= 3) return 'fort';
  if (longueur >= 8 && typesCount >= 2) return 'moyen';
  return 'faible';
}

/** Generateur pseudo-aleatoire deterministe (tests reproductibles). */
function prng(graine) {
  let etat = graine >>> 0;
  return () => {
    etat = (etat * 1664525 + 1013904223) >>> 0;
    return etat / 0x100000000;
  };
}

/* Caracteres Unicode ecrits en echappement pour eviter toute ambiguite
 * d'encodage du fichier de test lui-meme. */
const E_ACCENT_PRECOMPOSE = '\u00E9';        // 'é' en un seul point de code (forme NFC)
const E_ACCENT_DECOMPOSE  = 'e\u0301';      // 'é' = 'e' + accent combinant (forme NFD)
const JE_MAJUSCULE_CYRILLIQUE = '\u0416';   // 'Ж' (majuscule cyrillique)
const EMOJI_CADENAS = '\u{1F512}';           // "🔒" (hors du plan multilingue de base)

/* =============================================================================
 * 1. CAS NOMMES COUVRANT LES 4 NIVEAUX
 * ========================================================================== */

const CAS_NOMMES = [
  // ---------------------------- FAIBLE -------------------------------------
  {
    nom: 'chaine vide',
    mdp: '',
    attendu: 'faible',
    pourquoi: 'Aucun caractere : aucun palier n\'est atteint, on retombe sur le niveau par defaut.',
  },
  {
    nom: 'trois lettres minuscules',
    mdp: 'abc',
    attendu: 'faible',
    pourquoi: '3 caracteres : bien en dessous des 8 exiges par le niveau Moyen.',
  },
  {
    nom: 'sept chiffres',
    mdp: '1234567',
    attendu: 'faible',
    pourquoi: '7 caracteres et un seul type (chiffres) : deux raisons d\'etre Faible.',
  },
  {
    nom: 'sept caracteres mais deux types',
    mdp: 'Abcdefg',
    attendu: 'faible',
    pourquoi: '2 types suffiraient pour Moyen, mais la longueur (7) est insuffisante.',
  },
  {
    nom: 'dix minuscules seulement',
    mdp: 'motdepasse',
    attendu: 'faible',
    pourquoi: 'Longueur suffisante (10) mais UN SEUL type de caractere : Faible.',
  },
  {
    nom: 'dix majuscules seulement',
    mdp: 'AZERTYUIOP',
    attendu: 'faible',
    pourquoi: 'Un seul type (majuscules) : la longueur ne rattrape jamais le manque de types.',
  },
  {
    nom: 'dix chiffres seulement',
    mdp: '1234567890',
    attendu: 'faible',
    pourquoi: 'Un seul type (chiffres).',
  },
  {
    nom: 'dix caracteres speciaux seulement',
    mdp: '!!!!!!!!!!',
    attendu: 'faible',
    pourquoi: 'Un seul type (speciaux) : meme les speciaux seuls ne suffisent pas.',
  },
  {
    nom: 'vingt minuscules',
    mdp: 'abcdefghijklmnopqrst',
    attendu: 'faible',
    pourquoi: 'Meme tres long (20), un seul type reste Faible : c\'est la regle du cahier des charges.',
  },
  {
    nom: 'huit espaces',
    mdp: '        ',
    attendu: 'faible',
    pourquoi: '8 caracteres mais un seul type (l\'espace compte comme caractere special).',
  },

  // ----------------------------- MOYEN -------------------------------------
  {
    nom: 'huit caracteres, deux types',
    mdp: 'Abcdefgh',
    attendu: 'moyen',
    pourquoi: 'Exactement le minimum de Moyen : longueur 8 et 2 types (minuscules + majuscules).',
  },
  {
    nom: 'neuf caracteres, lettres et chiffres',
    mdp: 'bonjour42',
    attendu: 'moyen',
    pourquoi: 'Longueur 9 (>= 8) et 2 types : Moyen. Fort exigerait 12 caracteres et 3 types.',
  },
  {
    nom: 'onze caracteres, deux types',
    mdp: 'chevalier42',
    attendu: 'moyen',
    pourquoi: '11 caracteres : encore un de moins que les 12 requis pour Fort.',
  },
  {
    nom: 'onze caracteres, trois types',
    mdp: 'Abcdefghij1',
    attendu: 'moyen',
    pourquoi: '3 types sont la, mais Fort exige AUSSI 12 caracteres : la longueur bloque.',
  },
  {
    nom: 'douze caracteres, deux types seulement',
    mdp: 'abcdefghijKL',
    attendu: 'moyen',
    pourquoi: 'Longueur suffisante pour Fort, mais seulement 2 types : Fort en exige 3.',
  },
  {
    nom: 'vingt caracteres, deux types seulement',
    mdp: 'abcdefghijklmnopqrsT',
    attendu: 'moyen',
    pourquoi: 'Cas cle du cahier des charges : 20 caracteres a 2 types RESTENT Moyen.',
  },

  // ------------------------------ FORT -------------------------------------
  {
    nom: 'douze caracteres, trois types',
    mdp: 'Abcdefghijk1',
    attendu: 'fort',
    pourquoi: 'Exactement le minimum de Fort : longueur 12 et 3 types.',
  },
  {
    nom: 'quatorze caracteres, quatre types',
    mdp: 'Tr0ubadour&Cie',
    attendu: 'fort',
    pourquoi: 'Les 4 types sont presents, mais 14 < 16 : Tres fort est hors de portee.',
  },
  {
    nom: 'phrase de passe avec espaces',
    mdp: 'Mon chien 42!',
    attendu: 'fort',
    pourquoi: '13 caracteres et 4 types (l\'espace est un special) : Fort, pas encore Tres fort.',
  },
  {
    nom: 'quinze caracteres, quatre types',
    mdp: 'Abcdefghijklm1!',
    attendu: 'fort',
    pourquoi: 'Il manque UN caractere pour atteindre les 16 du niveau Tres fort.',
  },
  {
    nom: 'seize caracteres, trois types seulement',
    mdp: 'abcdefghijklmN12',
    attendu: 'fort',
    pourquoi: 'Cas cle du cahier des charges : 16 caracteres sans caractere special = Fort.',
  },

  // --------------------------- TRES FORT -----------------------------------
  {
    nom: 'seize caracteres, quatre types',
    mdp: 'abcdefghijklmN1!',
    attendu: 'tres_fort',
    pourquoi: 'Exactement le minimum de Tres fort : longueur 16 et les 4 types.',
  },
  {
    nom: 'seize caracteres, quatre types (variante)',
    mdp: 'Abcdefghijklmn1!',
    attendu: 'tres_fort',
    pourquoi: 'Autre combinaison au seuil exact : 16 caracteres, 4 types.',
  },
  {
    nom: 'phrase de passe longue',
    mdp: 'Corr3ct-Ch3val-Batt3rie!',
    attendu: 'tres_fort',
    pourquoi: '24 caracteres et 4 types : toutes les conditions du niveau maximal sont remplies.',
  },
  {
    nom: 'phrase de passe accentuee',
    mdp: 'Z' + E_ACCENT_PRECOMPOSE + 'phyr-2024-Nuage!',
    attendu: 'tres_fort',
    pourquoi: '18 points de code et 4 types ; le "e accent aigu" compte comme minuscule.',
  },
];

describe('1. Cahier des charges — cas nommes couvrant les 4 niveaux', () => {
  for (const cas of CAS_NOMMES) {
    test(`"${cas.nom}" doit etre classe "${cas.attendu}"`, () => {
      const resultat = analyzePassword(cas.mdp);
      assert.equal(resultat.level, cas.attendu, `${cas.pourquoi} (obtenu : ${resultat.level})`);
      // Coherence interne : l'identifiant et l'index doivent toujours concorder.
      assert.equal(resultat.levelIndex, palier(cas.attendu).index, 'levelIndex doit correspondre a level');
    });
  }

  test('chaque cas nomme est conforme a la specification re-implementee independamment', () => {
    for (const cas of CAS_NOMMES) {
      const r = analyzePassword(cas.mdp);
      assert.equal(
        r.level,
        niveauAttenduSelonSpec(r.length, r.typesCount),
        `Divergence pour "${cas.nom}" : ${r.length} caracteres, ${r.typesCount} types`,
      );
    }
  });

  test('les 4 niveaux du cahier des charges sont tous couverts par le tableau de cas', () => {
    const couverts = new Set(CAS_NOMMES.map((c) => c.attendu));
    assert.deepEqual([...couverts].sort(), ['faible', 'fort', 'moyen', 'tres_fort']);
  });
});

/* =============================================================================
 * 2. FRONTIERES EXACTES DE LONGUEUR
 * ========================================================================== */

describe('2. Frontieres exactes de longueur (7/8, 11/12, 15/16)', () => {
  test('7 caracteres avec 2 types = faible, 8 caracteres avec 2 types = moyen', () => {
    assert.equal(codePointLength('Abcdefg'), 7, 'le temoin doit bien faire 7 caracteres');
    assert.equal(codePointLength('Abcdefgh'), 8, 'le temoin doit bien faire 8 caracteres');
    assert.equal(niveau('Abcdefg'), 'faible', '7 < 8 : Moyen inatteignable');
    assert.equal(niveau('Abcdefgh'), 'moyen', '8 est le seuil INCLUSIF de Moyen');
  });

  test('11 caracteres avec 3 types = moyen, 12 caracteres avec 3 types = fort', () => {
    assert.equal(codePointLength('Abcdefghij1'), 11);
    assert.equal(codePointLength('Abcdefghijk1'), 12);
    assert.equal(niveau('Abcdefghij1'), 'moyen', '11 < 12 : Fort inatteignable malgre 3 types');
    assert.equal(niveau('Abcdefghijk1'), 'fort', '12 est le seuil INCLUSIF de Fort');
  });

  test('15 caracteres avec 4 types = fort, 16 caracteres avec 4 types = tres fort', () => {
    assert.equal(codePointLength('Abcdefghijklm1!'), 15);
    assert.equal(codePointLength('Abcdefghijklmn1!'), 16);
    assert.equal(niveau('Abcdefghijklm1!'), 'fort', '15 < 16 : Tres fort inatteignable malgre 4 types');
    assert.equal(niveau('Abcdefghijklmn1!'), 'tres_fort', '16 est le seuil INCLUSIF de Tres fort');
  });

  test('le seuil se decale d\'un cran a chaque caractere ajoute (balayage 6 -> 17)', () => {
    // Un mot de passe a 4 types que l'on allonge caractere par caractere.
    const attendus = {
      6: 'faible', 7: 'faible',            // < 8
      8: 'moyen', 9: 'moyen', 10: 'moyen', 11: 'moyen',   // >= 8, < 12
      12: 'fort', 13: 'fort', 14: 'fort', 15: 'fort',     // >= 12, < 16
      16: 'tres_fort', 17: 'tres_fort',    // >= 16
    };
    for (const [longueur, attendu] of Object.entries(attendus)) {
      const n = Number(longueur);
      // Base a 4 types : "aB1!" puis on complete avec des minuscules.
      const mdp = ('aB1!' + 'xyzwvutsrqponmlk').slice(0, n);
      assert.equal(codePointLength(mdp), n, `le temoin doit faire ${n} caracteres`);
      assert.equal(nbTypes(mdp), n >= 4 ? 4 : nbTypes(mdp), 'les 4 types doivent etre presents des 4 caracteres');
      assert.equal(niveau(mdp), attendu, `longueur ${n} avec 4 types`);
    }
  });
});

/* =============================================================================
 * 3. FRONTIERES EXACTES DU NOMBRE DE TYPES
 * ========================================================================== */

describe('3. Frontieres exactes du nombre de types (1/2, 2/3, 3/4)', () => {
  test('1 type = faible, 2 types = moyen (a longueur 10 constante)', () => {
    assert.equal(nbTypes('abcdefghij'), 1);
    assert.equal(nbTypes('abcdefghiJ'), 2);
    assert.equal(niveau('abcdefghij'), 'faible', 'un seul type : Faible quelle que soit la longueur');
    assert.equal(niveau('abcdefghiJ'), 'moyen', '2 types + longueur 10 : Moyen');
  });

  test('2 types = moyen, 3 types = fort (a longueur 12 constante)', () => {
    assert.equal(codePointLength('abcdefghijKL'), 12);
    assert.equal(codePointLength('abcdefghijK1'), 12);
    assert.equal(nbTypes('abcdefghijKL'), 2);
    assert.equal(nbTypes('abcdefghijK1'), 3);
    assert.equal(niveau('abcdefghijKL'), 'moyen', 'Fort exige 3 types, il n\'y en a que 2');
    assert.equal(niveau('abcdefghijK1'), 'fort', '12 caracteres + 3 types : Fort');
  });

  test('3 types = fort, 4 types = tres fort (a longueur 16 constante)', () => {
    assert.equal(codePointLength('abcdefghijklmN12'), 16);
    assert.equal(codePointLength('abcdefghijklmN1!'), 16);
    assert.equal(nbTypes('abcdefghijklmN12'), 3);
    assert.equal(nbTypes('abcdefghijklmN1!'), 4);
    assert.equal(niveau('abcdefghijklmN12'), 'fort');
    assert.equal(niveau('abcdefghijklmN1!'), 'tres_fort');
  });

  test('CAS CLE : 16 caracteres avec seulement 3 types est "fort" et NON "tres_fort"', () => {
    const mdp = 'abcdefghijklmN12'; // 16 caracteres, aucun caractere special
    const r = analyzePassword(mdp);
    assert.equal(r.length, 16, 'la longueur seule est suffisante pour Tres fort');
    assert.equal(r.typesCount, 3, 'mais il manque le 4e type (caractere special)');
    assert.equal(r.types.special, false, 'aucun caractere special dans ce mot de passe');
    assert.equal(r.level, 'fort', 'Tres fort exige les 4 types, sans exception');
    assert.notEqual(r.level, 'tres_fort');
  });

  test('CAS CLE : 20 caracteres avec seulement 2 types reste "moyen"', () => {
    const mdp = 'abcdefghijklmnopqrsT'; // 20 caracteres, minuscules + majuscules
    const r = analyzePassword(mdp);
    assert.equal(r.length, 20);
    assert.equal(r.typesCount, 2);
    assert.equal(r.level, 'moyen', 'la longueur ne compense JAMAIS le manque de types');
    assert.notEqual(r.level, 'fort');
    assert.notEqual(r.level, 'tres_fort');
  });

  test('l\'evaluation part bien du niveau le plus fort (premier palier satisfait)', () => {
    // Un mot de passe Tres fort satisfait aussi Moyen et Fort : c'est le plus
    // fort qui doit gagner, pas le premier trouve en partant du bas.
    const r = analyzePassword('Corr3ct-Ch3val-Batt3rie!');
    assert.equal(r.level, 'tres_fort');
    assert.equal(r.levelIndex, 3);
  });
});

/* =============================================================================
 * 4. classify() TESTEE DIRECTEMENT SUR UNE MATRICE LONGUEUR x TYPES
 * ========================================================================== */

describe('4. classify() — matrice longueur x nombre de types', () => {
  const LONGUEURS = [0, 1, 7, 8, 11, 12, 15, 16, 20];
  // Colonnes : 0, 1, 2, 3, 4 types
  const MATRICE = {
    0:  ['faible', 'faible', 'faible', 'faible', 'faible'],
    1:  ['faible', 'faible', 'faible', 'faible', 'faible'],
    7:  ['faible', 'faible', 'faible', 'faible', 'faible'],
    8:  ['faible', 'faible', 'moyen', 'moyen', 'moyen'],
    11: ['faible', 'faible', 'moyen', 'moyen', 'moyen'],
    12: ['faible', 'faible', 'moyen', 'fort', 'fort'],
    15: ['faible', 'faible', 'moyen', 'fort', 'fort'],
    16: ['faible', 'faible', 'moyen', 'fort', 'tres_fort'],
    20: ['faible', 'faible', 'moyen', 'fort', 'tres_fort'],
  };

  for (const longueur of LONGUEURS) {
    for (let types = 0; types <= 4; types++) {
      const attendu = MATRICE[longueur][types];
      test(`classify(${longueur}, ${types}) => "${attendu}"`, () => {
        const niv = classify(longueur, types, types === 4);
        assert.equal(niv.id, attendu);
        assert.equal(niv.index, palier(attendu).index);
      });
    }
  }

  test('classify() renvoie toujours un objet niveau valide de CONFIG.LEVELS', () => {
    for (let l = 0; l <= 40; l++) {
      for (let t = 0; t <= 4; t++) {
        const niv = classify(l, t, false);
        assert.ok(CONFIG.LEVELS.includes(niv), `classify(${l}, ${t}) doit renvoyer un palier declare`);
        assert.equal(niv.id, niveauAttenduSelonSpec(l, t), `classify(${l}, ${t})`);
      }
    }
  });

  test('classify() est monotone : allonger ou enrichir ne fait jamais baisser le niveau', () => {
    for (let l = 0; l <= 30; l++) {
      for (let t = 0; t <= 3; t++) {
        assert.ok(
          classify(l + 1, t, false).index >= classify(l, t, false).index,
          `ajouter un caractere (${l} -> ${l + 1}, ${t} types) ne doit pas degrader`,
        );
        assert.ok(
          classify(l, t + 1, false).index >= classify(l, t, false).index,
          `ajouter un type (${t} -> ${t + 1}, longueur ${l}) ne doit pas degrader`,
        );
      }
    }
  });
});

/* =============================================================================
 * 5. detectTypes() TESTEE ISOLEMENT
 * ========================================================================== */

describe('5. detectTypes() — detection isolee des 4 types', () => {
  test('detecte les minuscules seules', () => {
    assert.deepEqual(detectTypes('abc'), {
      lowercase: true, uppercase: false, digits: false, special: false,
    });
  });

  test('detecte les majuscules seules', () => {
    assert.deepEqual(detectTypes('ABC'), {
      lowercase: false, uppercase: true, digits: false, special: false,
    });
  });

  test('detecte les chiffres seuls', () => {
    assert.deepEqual(detectTypes('123'), {
      lowercase: false, uppercase: false, digits: true, special: false,
    });
  });

  test('detecte les caracteres speciaux seuls', () => {
    assert.deepEqual(detectTypes('!@#'), {
      lowercase: false, uppercase: false, digits: false, special: true,
    });
  });

  test('detecte les 4 types simultanement', () => {
    assert.deepEqual(detectTypes('aB1!'), {
      lowercase: true, uppercase: true, digits: true, special: true,
    });
  });

  test('la chaine vide ne contient aucun type', () => {
    assert.deepEqual(detectTypes(''), {
      lowercase: false, uppercase: false, digits: false, special: false,
    });
  });

  test('l\'espace est un caractere special, pas une lettre', () => {
    const t = detectTypes(' ');
    assert.equal(t.special, true, 'l\'espace n\'est ni une lettre ni un chiffre');
    assert.equal(t.lowercase, false);
    assert.equal(t.uppercase, false);
    assert.equal(t.digits, false);
  });

  test('la ponctuation, les symboles et le tiret sont des speciaux', () => {
    for (const c of ['-', '_', '.', ',', ';', ':', '/', '\\', '|', '~', '^', '$', '%', '#', '@', '&', '*', '(', ')', '[', ']', '{', '}', '+', '=', '<', '>', '?', '"', "'", '`']) {
      assert.equal(detectTypes(c).special, true, `"${c}" doit compter comme caractere special`);
    }
  });

  test('un seul caractere du bon type suffit a lever le drapeau', () => {
    assert.equal(detectTypes('aaaaaaaaaaZ').uppercase, true);
    assert.equal(detectTypes('aaaaaaaaaa9').digits, true);
    assert.equal(detectTypes('aaaaaaaaaa!').special, true);
  });

  test('detectTypes() est sans etat : deux appels successifs donnent le meme resultat', () => {
    // Garde-fou contre un `lastIndex` de regex mal maitrise (drapeau /g oublie).
    const premier = detectTypes('aB1!');
    const second = detectTypes('aB1!');
    assert.deepEqual(premier, second);
    assert.deepEqual(detectTypes('aB1!'), detectTypes('aB1!'));
  });

  test('TYPE_IDS declare exactement les 4 types du cahier des charges', () => {
    assert.deepEqual(TYPE_IDS, ['lowercase', 'uppercase', 'digits', 'special']);
    assert.equal(TYPE_IDS.length, 4);
  });

  test('typesCount = nombre de drapeaux vrais dans types', () => {
    for (const mdp of ['', 'a', 'aB', 'aB1', 'aB1!', '  ', '1!', 'ZZZ999']) {
      const r = analyzePassword(mdp);
      const compte = TYPE_IDS.reduce((n, id) => n + (r.types[id] ? 1 : 0), 0);
      assert.equal(r.typesCount, compte, `typesCount incoherent pour "${mdp}"`);
    }
  });
});

/* =============================================================================
 * 6. codePointLength() TESTEE ISOLEMENT
 * ========================================================================== */

describe('6. codePointLength() — longueur en points de code', () => {
  test('compte correctement une chaine ASCII', () => {
    assert.equal(codePointLength(''), 0);
    assert.equal(codePointLength('a'), 1);
    assert.equal(codePointLength('abcdefgh'), 8);
    assert.equal(codePointLength('Abcdefghijklmn1!'), 16);
  });

  test('compte les espaces comme des caracteres', () => {
    assert.equal(codePointLength(' '), 1);
    assert.equal(codePointLength('   '), 3);
    assert.equal(codePointLength('a b'), 3);
  });

  test('un emoji compte pour 1 caractere (et non 2 comme avec .length)', () => {
    assert.equal(EMOJI_CADENAS.length, 2, 'temoin : .length compte 2 unites UTF-16');
    assert.equal(codePointLength(EMOJI_CADENAS), 1, 'codePointLength doit compter 1 point de code');
  });

  test('plusieurs emojis : [...s].length et non s.length', () => {
    const mdp = EMOJI_CADENAS.repeat(5);
    assert.equal(mdp.length, 10, 'temoin UTF-16');
    assert.equal(codePointLength(mdp), 5, 'un emoji = un caractere');
  });

  test('les lettres accentuees precomposees comptent pour 1', () => {
    assert.equal(codePointLength(E_ACCENT_PRECOMPOSE), 1);
    assert.equal(codePointLength(JE_MAJUSCULE_CYRILLIQUE), 1);
  });
});

/* =============================================================================
 * 7. CAS LIMITES
 * ========================================================================== */

describe('7. Cas limites — le moteur ne doit jamais planter', () => {
  test('chaine vide : faible, longueur 0, score 0, isEmpty vrai', () => {
    const r = analyzePassword('');
    assert.equal(r.level, 'faible');
    assert.equal(r.levelIndex, 0);
    assert.equal(r.length, 0);
    assert.equal(r.score, 0);
    assert.equal(r.isEmpty, true);
    assert.equal(r.typesCount, 0);
  });

  test('un seul caractere : faible', () => {
    for (const mdp of ['a', 'A', '1', '!', ' ', EMOJI_CADENAS, JE_MAJUSCULE_CYRILLIQUE]) {
      const r = analyzePassword(mdp);
      assert.equal(r.length, 1, `"${mdp}" doit avoir une longueur de 1`);
      assert.equal(r.level, 'faible');
      assert.equal(r.isEmpty, false, 'un caractere n\'est pas une chaine vide');
    }
  });

  test('chaine composee uniquement d\'espaces : un seul type => faible', () => {
    const r = analyzePassword('                    '); // 20 espaces
    assert.equal(r.length, 20);
    assert.equal(r.typesCount, 1);
    assert.equal(r.types.special, true);
    assert.equal(r.level, 'faible');
  });

  test('les espaces internes sont pris en compte dans la longueur et les types', () => {
    const r = analyzePassword('Mon chien 42!');
    assert.equal(r.length, 13, 'les 2 espaces comptent dans la longueur');
    assert.equal(r.types.special, true, 'l\'espace fournit le type "special"');
    assert.equal(r.typesCount, 4);
    assert.equal(r.level, 'fort');
  });

  test('les espaces de tete et de fin ne sont PAS rognes', () => {
    const r = analyzePassword('  aB1  ');
    assert.equal(r.length, 7, 'le moteur ne doit pas faire de trim() implicite');
  });

  test('valeurs non-string : aucune exception, resultat neutre', () => {
    const valeurs = [null, undefined, 0, 42, 123456, NaN, true, false, {}, [], [1, 2], () => {}, Symbol.iterator];
    for (const v of valeurs) {
      const r = analyzePassword(v);
      assert.equal(r.level, 'faible', `${String(v)} doit etre traite comme vide => faible`);
      assert.equal(r.length, 0, `${String(v)} doit avoir une longueur de 0`);
      assert.equal(r.isEmpty, true);
      assert.equal(r.score, 0);
      assert.equal(r.typesCount, 0);
    }
  });

  test('appeler analyzePassword() sans argument ne plante pas', () => {
    assert.doesNotThrow(() => analyzePassword());
    assert.equal(analyzePassword().level, 'faible');
  });

  test('un mot de passe tres long ne plante pas et reste borne', () => {
    const r = analyzePassword('aB1!'.repeat(500)); // 2000 caracteres
    assert.equal(r.length, 2000);
    assert.equal(r.level, 'tres_fort');
    assert.equal(r.score, 100, 'le score reste plafonne a 100');
  });

  test('codePointLength() attend une chaine : analyzePassword la protege en amont', () => {
    // Comportement documente : codePointLength(null) leve (spread sur non-iterable),
    // mais analyzePassword() convertit toute valeur non-string en '' avant l'appel.
    assert.throws(() => codePointLength(null), TypeError);
    assert.doesNotThrow(() => analyzePassword(null), 'analyzePassword doit absorber le null');
  });
});

/* =============================================================================
 * 8. UNICODE
 * ========================================================================== */

describe('8. Unicode — lettres accentuees, cyrillique, emojis', () => {
  test('"e accent aigu" compte comme une minuscule', () => {
    const t = detectTypes(E_ACCENT_PRECOMPOSE);
    assert.equal(t.lowercase, true, '"é" est une lettre minuscule Unicode');
    assert.equal(t.uppercase, false);
    assert.equal(t.digits, false);
  });

  test('les caracteres accentues ne sont PAS comptes comme speciaux', () => {
    for (const c of ['é', 'è', 'ê', 'à', 'ç', 'ù', 'ï', 'ô']) {
      const t = detectTypes(c);
      assert.equal(t.special, false, `"${c}" est une lettre, pas un caractere special`);
      assert.equal(t.lowercase, true, `"${c}" doit compter comme minuscule`);
    }
  });

  test('les majuscules accentuees comptent comme majuscules et non comme speciales', () => {
    for (const c of ['É', 'À', 'Ç', 'Ô']) { // É À Ç Ô
      const t = detectTypes(c);
      assert.equal(t.uppercase, true, `"${c}" doit compter comme majuscule`);
      assert.equal(t.special, false, `"${c}" ne doit pas compter comme special`);
    }
  });

  test('"Ж" (cyrillique) compte comme une majuscule', () => {
    const t = detectTypes(JE_MAJUSCULE_CYRILLIQUE);
    assert.equal(t.uppercase, true, '"Ж" est une lettre majuscule Unicode');
    assert.equal(t.lowercase, false);
    assert.equal(t.special, false, 'une lettre cyrillique n\'est pas un caractere special');
  });

  test('"ж" (cyrillique minuscule) compte comme une minuscule', () => {
    const t = detectTypes('ж');
    assert.equal(t.lowercase, true);
    assert.equal(t.uppercase, false);
    assert.equal(t.special, false);
  });

  test('un emoji compte comme caractere special et pour 1 caractere', () => {
    const r = analyzePassword(EMOJI_CADENAS);
    assert.equal(r.length, 1, 'un emoji = 1 point de code, pas 2 unites UTF-16');
    assert.equal(r.types.special, true, 'un emoji n\'est ni lettre ni chiffre => special');
    assert.equal(r.typesCount, 1);
    assert.equal(r.level, 'faible');
  });

  test('15 points de code avec emojis = fort (et non tres_fort a cause de .length)', () => {
    const mdp = 'aB1!' + EMOJI_CADENAS.repeat(11); // 15 points de code, 26 unites UTF-16
    assert.equal(mdp.length, 26, 'temoin : .length surestime la longueur');
    assert.equal(analyzePassword(mdp).length, 15, 'le moteur doit compter 15');
    assert.equal(niveau(mdp), 'fort', 'si le moteur utilisait .length, il dirait a tort tres_fort');
  });

  test('16 points de code avec emojis = tres_fort', () => {
    const mdp = 'aB1!' + EMOJI_CADENAS.repeat(12); // 16 points de code
    const r = analyzePassword(mdp);
    assert.equal(r.length, 16);
    assert.equal(r.typesCount, 4);
    assert.equal(r.level, 'tres_fort');
  });

  test('un mot de passe entierement accentue reste faible (un seul type)', () => {
    const mdp = E_ACCENT_PRECOMPOSE.repeat(20);
    const r = analyzePassword(mdp);
    assert.equal(r.length, 20);
    assert.equal(r.typesCount, 1, 'uniquement des minuscules');
    assert.equal(r.types.special, false, 'aucun accent ne doit etre compte comme special');
    assert.equal(r.level, 'faible');
  });

  test('un mot de passe cyrillique melange suit les memes regles', () => {
    // "Привет" + chiffres + special, 16 points de code
    const mdp = 'Привет-2024-Mir!'; // 16 caracteres
    const r = analyzePassword(mdp);
    assert.equal(r.length, 16);
    assert.equal(r.types.uppercase, true, '"П" et "M" sont des majuscules');
    assert.equal(r.types.lowercase, true, '"ривет" sont des minuscules');
    assert.equal(r.types.digits, true);
    assert.equal(r.types.special, true, 'les tirets et le "!" sont des speciaux');
    assert.equal(r.level, 'tres_fort');
  });

  test('LIMITE CONNUE : un accent combinant (forme decomposee NFD) compte comme special', () => {
    // "é" ecrit "e" + U+0301 : l'accent combinant n'est ni \p{L} ni \p{N},
    // il est donc classe "special" et la longueur vaut 2 au lieu de 1.
    // Ce test documente le comportement REEL du moteur (voir rapport).
    const t = detectTypes(E_ACCENT_DECOMPOSE);
    assert.equal(codePointLength(E_ACCENT_DECOMPOSE), 2, 'forme decomposee : 2 points de code');
    assert.equal(t.lowercase, true, 'le "e" de base est bien une minuscule');
    assert.equal(t.special, true, 'l\'accent combinant est compte comme special (limite connue)');
    // La forme precomposee, elle, se comporte comme attendu :
    assert.equal(codePointLength(E_ACCENT_PRECOMPOSE), 1);
    assert.equal(detectTypes(E_ACCENT_PRECOMPOSE).special, false);
  });
});

/* =============================================================================
 * 9. computeScore()
 * ========================================================================== */

describe('9. computeScore() — score continu 0..100', () => {
  test('exactement 0 pour la chaine vide', () => {
    assert.equal(computeScore(0, 0, palier('faible')), 0);
    assert.equal(analyzePassword('').score, 0);
  });

  test('exactement 100 pour un mot de passe tres fort', () => {
    assert.equal(computeScore(16, 4, palier('tres_fort')), 100);
    assert.equal(computeScore(64, 4, palier('tres_fort')), 100);
    assert.equal(analyzePassword('abcdefghijklmN1!').score, 100);
    assert.equal(analyzePassword('Corr3ct-Ch3val-Batt3rie!').score, 100);
  });

  test('le score est toujours borne entre 0 et 100', () => {
    for (let l = 0; l <= 80; l++) {
      for (let t = 0; t <= 4; t++) {
        const s = computeScore(l, t, classify(l, t, t === 4));
        assert.ok(s >= 0, `score negatif pour (${l}, ${t}) : ${s}`);
        assert.ok(s <= 100, `score > 100 pour (${l}, ${t}) : ${s}`);
        assert.ok(Number.isInteger(s), `le score doit etre un entier (${l}, ${t}) : ${s}`);
      }
    }
  });

  test('le score reste dans la plage de son niveau (25 points par palier)', () => {
    for (let l = 0; l <= 40; l++) {
      for (let t = 0; t <= 4; t++) {
        const niv = classify(l, t, t === 4);
        const s = computeScore(l, t, niv);
        if (l === 0) {
          assert.equal(s, 0);
        } else if (niv.index === 3) {
          assert.equal(s, 100, 'tres fort = 100');
        } else {
          assert.ok(s >= niv.index * 25, `(${l}, ${t}) score ${s} sous le plancher du niveau ${niv.id}`);
          assert.ok(s <= niv.index * 25 + 24, `(${l}, ${t}) score ${s} deborde sur le niveau suivant`);
        }
      }
    }
  });

  test('MONOTONIE : ajouter un caractere ne fait jamais baisser le score', () => {
    const alphabet = [...('abcdefghijklmnopqrstuvwxyz' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' + '0123456789' + '!@#$%^&*-_ ' + E_ACCENT_PRECOMPOSE + JE_MAJUSCULE_CYRILLIQUE + EMOJI_CADENAS)];
    const alea = prng(20240917);
    for (let essai = 0; essai < 200; essai++) {
      let mdp = '';
      let precedent = 0;
      for (let i = 0; i < 25; i++) {
        mdp += alphabet[Math.floor(alea() * alphabet.length)];
        const courant = analyzePassword(mdp).score;
        assert.ok(
          courant >= precedent,
          `baisse de score en ajoutant un caractere : ${precedent} -> ${courant} (longueur ${codePointLength(mdp)})`,
        );
        precedent = courant;
      }
    }
  });

  test('MONOTONIE : le niveau ne redescend jamais quand on allonge un mot de passe valide', () => {
    const alea = prng(777);
    const alphabet = [...'abcXYZ789!@#'];
    for (let essai = 0; essai < 100; essai++) {
      let mdp = 'aB1!';
      let precedent = analyzePassword(mdp).levelIndex;
      for (let i = 0; i < 20; i++) {
        mdp += alphabet[Math.floor(alea() * alphabet.length)];
        const courant = analyzePassword(mdp).levelIndex;
        assert.ok(courant >= precedent, `le niveau a baisse : ${precedent} -> ${courant} pour "${mdp}"`);
        precedent = courant;
      }
    }
  });

  test('le score progresse a l\'interieur d\'un meme niveau', () => {
    const court = analyzePassword('Abcdefgh').score;      // moyen, 8 caracteres
    const long = analyzePassword('Abcdefghijk').score;    // moyen, 11 caracteres
    assert.ok(long > court, 'a niveau egal, un mot de passe plus long doit mieux scorer');
    assert.ok(court >= 25 && long <= 49, 'les deux restent dans la plage du niveau Moyen');
  });

  test('la chaine vide court-circuite le calcul, meme avec un palier eleve', () => {
    // Comportement documente : longueur 0 => 0, quel que soit le niveau passe.
    assert.equal(computeScore(0, 4, palier('tres_fort')), 0);
  });
});

/* =============================================================================
 * 10. generateStrongPassword()
 * ========================================================================== */

describe('10. generateStrongPassword() — generateur de mot de passe', () => {
  test('sur 200 generations, TOUTES sont "tres_fort"', () => {
    const vus = new Set();
    for (let i = 0; i < 200; i++) {
      const mdp = generateStrongPassword();
      const r = analyzePassword(mdp);
      assert.equal(r.level, 'tres_fort', `generation #${i} non tres_fort : "${mdp}" (${r.level})`);
      assert.equal(r.score, 100, `generation #${i} : score attendu 100`);
      assert.ok(r.length >= 16, `generation #${i} : longueur ${r.length} < 16`);
      assert.equal(r.typesCount, 4, `generation #${i} : ${r.typesCount} types au lieu de 4`);
      vus.add(mdp);
    }
    assert.ok(vus.size > 190, `les mots de passe generes doivent etre varies (${vus.size}/200 distincts)`);
  });

  test('les 4 types sont toujours presents (100 generations)', () => {
    for (let i = 0; i < 100; i++) {
      const t = detectTypes(generateStrongPassword(16));
      assert.equal(t.lowercase, true, `generation #${i} sans minuscule`);
      assert.equal(t.uppercase, true, `generation #${i} sans majuscule`);
      assert.equal(t.digits, true, `generation #${i} sans chiffre`);
      assert.equal(t.special, true, `generation #${i} sans caractere special`);
    }
  });

  test('la longueur demandee est respectee', () => {
    for (const n of [16, 17, 20, 24, 32, 48, 64]) {
      const mdp = generateStrongPassword(n);
      assert.equal(codePointLength(mdp), n, `longueur demandee ${n}`);
      assert.equal(niveau(mdp), 'tres_fort');
    }
  });

  test('la longueur par defaut est 20', () => {
    assert.equal(codePointLength(generateStrongPassword()), 20);
  });

  test('une longueur demandee trop petite est ramenee au minimum 16', () => {
    for (const n of [4, 0, 1, 8, 15, -10]) {
      const mdp = generateStrongPassword(n);
      assert.ok(codePointLength(mdp) >= 16, `longueur ${n} demandee => ${codePointLength(mdp)} obtenue, < 16`);
      assert.equal(niveau(mdp), 'tres_fort', `longueur ${n} demandee : le resultat doit rester tres fort`);
    }
    assert.equal(codePointLength(generateStrongPassword(4)), 16, 'une demande de 4 donne exactement 16');
  });

  test('une longueur demandee excessive est plafonnee a 64', () => {
    assert.equal(codePointLength(generateStrongPassword(100)), 64);
    assert.equal(codePointLength(generateStrongPassword(1000)), 64);
  });

  test('une longueur invalide retombe sur la valeur par defaut ou le minimum', () => {
    for (const n of [NaN, undefined, null, 'abc']) {
      const mdp = generateStrongPassword(n);
      assert.ok(codePointLength(mdp) >= 16, `entree invalide ${String(n)} : longueur trop courte`);
      assert.equal(niveau(mdp), 'tres_fort');
    }
  });

  test('un mot de passe genere n\'utilise pas de caracteres ambigus (l, I, O, 0, 1)', () => {
    for (let i = 0; i < 50; i++) {
      const mdp = generateStrongPassword(32);
      for (const c of ['l', 'I', 'O', '0', '1']) {
        assert.ok(!mdp.includes(c), `caractere ambigu "${c}" trouve dans "${mdp}"`);
      }
    }
  });
});

/* =============================================================================
 * 11. isCommonPassword()
 * ========================================================================== */

describe('11. isCommonPassword() — mots de passe les plus courants', () => {
  test('"password", "azerty" et "123456" sont detectes', () => {
    assert.equal(isCommonPassword('password'), true);
    assert.equal(isCommonPassword('azerty'), true);
    assert.equal(isCommonPassword('123456'), true);
  });

  test('la detection est insensible a la casse', () => {
    assert.equal(isCommonPassword('PASSWORD'), true);
    assert.equal(isCommonPassword('Azerty'), true);
    assert.equal(isCommonPassword('MotDePasse'), true);
  });

  test('les suffixes de chiffres et de symboles ne trompent pas la detection', () => {
    assert.equal(isCommonPassword('Password123!'), true, '"Password123!" n\'est pas plus sur que "password"');
    assert.equal(isCommonPassword('azerty2024'), true);
    assert.equal(isCommonPassword('bonjour!!!'), true);
  });

  test('les classiques francais et russes de la liste sont detectes', () => {
    for (const mdp of ['motdepasse', 'soleil', 'bonjour', 'chocolat', 'jetaime', 'пароль']) {
      assert.equal(isCommonPassword(mdp), true, `"${mdp}" devrait figurer dans la liste`);
    }
  });

  test('un mot de passe genere n\'est jamais considere comme courant (100 essais)', () => {
    for (let i = 0; i < 100; i++) {
      const mdp = generateStrongPassword();
      assert.equal(isCommonPassword(mdp), false, `"${mdp}" ne doit pas etre vu comme un mot de passe courant`);
    }
  });

  test('un mot de passe original n\'est pas considere comme courant', () => {
    for (const mdp of ['Corr3ct-Ch3val-Batt3rie!', 'Zx9!vuTr4Qm#Lk2p', 'MonChatS4uteHaut!']) {
      assert.equal(isCommonPassword(mdp), false, `"${mdp}" ne figure pas dans la liste`);
    }
  });

  test('valeurs vides ou absentes : false, sans exception', () => {
    assert.equal(isCommonPassword(''), false);
    assert.equal(isCommonPassword(null), false);
    assert.equal(isCommonPassword(undefined), false);
    assert.doesNotThrow(() => isCommonPassword(''));
  });

  test('une liste personnalisee remplace la liste par defaut', () => {
    assert.equal(isCommonPassword('monsecret', ['monsecret']), true, 'liste sous forme de tableau');
    assert.equal(isCommonPassword('monsecret', new Set(['monsecret'])), true, 'liste sous forme de Set');
    assert.equal(isCommonPassword('password', ['autrechose']), false, 'la liste fournie fait foi');
  });

  test('la liste par defaut est un Set non vide', () => {
    assert.ok(COMMON_PASSWORDS instanceof Set);
    assert.ok(COMMON_PASSWORDS.size >= 50, `liste trop courte : ${COMMON_PASSWORDS.size}`);
    assert.ok(COMMON_PASSWORDS.has('123456'));
  });

  test('un mot de passe courant est signale sans etre retrograde (config par defaut)', () => {
    // DOWNGRADE_COMMON_PASSWORDS vaut false par defaut : le niveau officiel
    // reste celui du cahier des charges, mais l'avertissement est present.
    assert.equal(CONFIG.DOWNGRADE_COMMON_PASSWORDS, false, 'valeur par defaut attendue');
    const r = analyzePassword('Password123!');
    assert.equal(r.bonus.isCommon, true, 'le moteur doit signaler un mot de passe courant');
    assert.equal(r.bonus.downgraded, false, 'aucune retrogradation avec la config par defaut');
    assert.equal(r.level, 'fort', '12 caracteres et 4 types : Fort selon le cahier des charges');
  });
});

/* =============================================================================
 * 12. CONFIG.STRICT_SPECIAL_CHAR_RULE
 * ========================================================================== */

describe('12. CONFIG.STRICT_SPECIAL_CHAR_RULE — lecture litterale du cahier des charges', () => {
  test('par defaut, la regle stricte est desactivee', () => {
    assert.equal(CONFIG.STRICT_SPECIAL_CHAR_RULE, false);
    assert.equal(niveau('abcdefghijklmN12'), 'fort', 'sans regle stricte : 16 caracteres, 3 types => Fort');
  });

  test('active a true, un mot de passe sans caractere special devient "faible"', () => {
    const initial = CONFIG.STRICT_SPECIAL_CHAR_RULE;
    try {
      CONFIG.STRICT_SPECIAL_CHAR_RULE = true;

      // Sans caractere special => Faible, quelles que soient longueur et types.
      assert.equal(niveau('abcdefghijklmN12'), 'faible', '16 caracteres, 3 types, aucun special');
      assert.equal(niveau('Abcdefghijk1'), 'faible', '12 caracteres, 3 types, aucun special');
      assert.equal(niveau('Abcdefgh'), 'faible', '8 caracteres, 2 types, aucun special');
      assert.equal(niveau('abcdefghijklmnopqrsT'), 'faible', '20 caracteres, aucun special');

      // Avec caractere special, les regles normales reprennent leurs droits.
      assert.equal(niveau('abcdefghijklmN1!'), 'tres_fort', '16 caracteres, 4 types');
      assert.equal(niveau('Abcdefghijklm1!'), 'fort', '15 caracteres, 4 types');
      assert.equal(niveau('Mon chien 42!'), 'fort', 'l\'espace + "!" fournissent le special');

      // classify() applique la regle directement.
      assert.equal(classify(20, 3, false).id, 'faible', 'classify() sans special => faible');
      assert.equal(classify(20, 4, true).id, 'tres_fort', 'classify() avec special => regles normales');

      // Le score suit le niveau retrograde.
      assert.ok(analyzePassword('abcdefghijklmN12').score <= 24, 'score plafonne dans la plage Faible');
    } finally {
      CONFIG.STRICT_SPECIAL_CHAR_RULE = initial;
    }
  });

  test('la configuration est bien restauree apres le test precedent', () => {
    assert.equal(CONFIG.STRICT_SPECIAL_CHAR_RULE, false, 'la regle stricte doit etre remise a false');
    assert.equal(niveau('abcdefghijklmN12'), 'fort', 'comportement par defaut retabli');
  });
});

/* =============================================================================
 * 13. AUTRES BASCULES DE CONFIGURATION (toujours restaurees)
 * ========================================================================== */

describe('13. Autres bascules de CONFIG', () => {
  test('DOWNGRADE_COMMON_PASSWORDS a true retrograde un mot de passe courant', () => {
    const initial = CONFIG.DOWNGRADE_COMMON_PASSWORDS;
    try {
      CONFIG.DOWNGRADE_COMMON_PASSWORDS = true;
      const r = analyzePassword('Password123!');
      assert.equal(r.bonus.isCommon, true);
      assert.equal(r.bonus.downgraded, true, 'la retrogradation doit etre signalee');
      assert.equal(r.level, 'faible', 'un mot de passe du top des fuites redevient Faible');

      const original = analyzePassword('Zx9!vuTr4Qm#Lk2p');
      assert.equal(original.bonus.downgraded, false, 'un mot de passe original n\'est pas retrograde');
      assert.equal(original.level, 'tres_fort');
    } finally {
      CONFIG.DOWNGRADE_COMMON_PASSWORDS = initial;
    }
    assert.equal(CONFIG.DOWNGRADE_COMMON_PASSWORDS, false, 'configuration restauree');
  });

  test('UNICODE_AWARE a false bascule en mode ASCII strict', () => {
    const initial = CONFIG.UNICODE_AWARE;
    try {
      CONFIG.UNICODE_AWARE = false;
      const t = detectTypes(E_ACCENT_PRECOMPOSE);
      assert.equal(t.lowercase, false, 'en ASCII strict, "é" n\'est plus une minuscule');
      assert.equal(t.special, true, 'en ASCII strict, "é" devient un caractere special');
      assert.deepEqual(detectTypes('aB1!'), {
        lowercase: true, uppercase: true, digits: true, special: true,
      }, 'l\'ASCII pur est detecte a l\'identique dans les deux modes');
    } finally {
      CONFIG.UNICODE_AWARE = initial;
    }
    assert.equal(CONFIG.UNICODE_AWARE, true, 'configuration restauree');
    assert.equal(detectTypes(E_ACCENT_PRECOMPOSE).lowercase, true, 'mode Unicode retabli');
  });

  test('les seuils declares dans CONFIG.LEVELS sont ceux du cahier des charges', () => {
    assert.deepEqual(
      CONFIG.LEVELS.map((l) => [l.id, l.minLength, l.minTypes]),
      [
        ['tres_fort', 16, 4],
        ['fort', 12, 3],
        ['moyen', 8, 2],
        ['faible', 0, 0],
      ],
      'les paliers doivent etre declares du plus fort au plus faible',
    );
    assert.equal(CONFIG.MIN_LENGTH_CRITERION, 8);
  });
});

/* =============================================================================
 * 14. CONFIDENTIALITE : le mot de passe ne ressort jamais
 * ========================================================================== */

describe('14. Confidentialite du resultat', () => {
  test('analyzePassword() ne renvoie jamais le mot de passe en clair', () => {
    const secret = 'MonSecretUltraPrive2024!';
    const r = analyzePassword(secret);
    assert.equal(r.password, undefined, 'result.password doit etre undefined');
  });

  test('aucune propriete du resultat ne contient le mot de passe (verification en profondeur)', () => {
    const secret = 'ZorglubXyzzy2024!!';
    const r = analyzePassword(secret);
    const serialise = JSON.stringify(r);
    assert.ok(!serialise.includes(secret), 'le mot de passe complet ne doit apparaitre nulle part');
    assert.ok(!serialise.includes('Zorglub'), 'aucun fragment du mot de passe ne doit fuiter');
    assert.ok(!serialise.includes('Xyzzy'), 'aucun fragment du mot de passe ne doit fuiter');
  });

  test('la propriete password est undefined pour tous les niveaux', () => {
    for (const mdp of ['', 'a', 'Abcdefgh', 'Abcdefghijk1', 'abcdefghijklmN1!', generateStrongPassword()]) {
      assert.equal(analyzePassword(mdp).password, undefined, `fuite possible pour "${mdp}"`);
    }
  });
});

/* =============================================================================
 * 15. STRUCTURE DU RESULTAT (criteres affiches, palier suivant)
 * ========================================================================== */

describe('15. Structure du resultat — criteres et palier suivant', () => {
  test('le resultat expose toutes les cles attendues', () => {
    const r = analyzePassword('Abcdefghijk1');
    for (const cle of ['length', 'types', 'typesCount', 'level', 'levelIndex', 'score', 'criteria', 'nextLevel', 'isEmpty', 'bonus']) {
      assert.ok(cle in r, `cle manquante dans le resultat : ${cle}`);
    }
  });

  test('la liste des criteres reflete l\'etat reel du mot de passe', () => {
    const r = analyzePassword('abc');
    const parId = Object.fromEntries(r.criteria.map((c) => [c.id, c]));
    assert.equal(parId.length.ok, false, '3 caracteres < 8');
    assert.equal(parId.length.value, 3, 'le critere de longueur expose la longueur reelle');
    assert.equal(parId.lowercase.ok, true);
    assert.equal(parId.uppercase.ok, false);
    assert.equal(parId.digits.ok, false);
    assert.equal(parId.special.ok, false);
  });

  test('tous les criteres sont valides pour un mot de passe tres fort', () => {
    const r = analyzePassword('abcdefghijklmN1!');
    for (const critere of r.criteria) {
      assert.equal(critere.ok, true, `le critere "${critere.id}" devrait etre satisfait`);
    }
    assert.equal(r.criteria.length, 5, '5 criteres affiches : longueur + 4 types');
  });

  test('nextLevel indique ce qu\'il manque pour monter d\'un cran', () => {
    const r = analyzePassword('abc'); // faible : 3 caracteres, 1 type
    assert.equal(r.nextLevel.id, 'moyen');
    assert.equal(r.nextLevel.missingLength, 5, 'il manque 5 caracteres pour atteindre 8');
    assert.equal(r.nextLevel.missingTypes, 1, 'il manque 1 type pour atteindre 2');
  });

  test('nextLevel n\'exige plus rien quand seul un critere bloque', () => {
    const r = analyzePassword('Abcdefghijklm1!'); // fort : 15 caracteres, 4 types
    assert.equal(r.nextLevel.id, 'tres_fort');
    assert.equal(r.nextLevel.missingLength, 1, 'il manque exactement 1 caractere');
    assert.equal(r.nextLevel.missingTypes, 0, 'les 4 types sont deja la');
  });

  test('nextLevel vaut null au niveau maximal', () => {
    const r = analyzePassword('Corr3ct-Ch3val-Batt3rie!');
    assert.equal(r.level, 'tres_fort');
    assert.equal(r.nextLevel, null, 'aucun palier au-dessus de Tres fort');
  });

  test('les analyses bonus sont presentes et ne modifient pas le niveau officiel', () => {
    const r = analyzePassword('aaaaaaaaaaaa'); // repetition evidente
    assert.equal(typeof r.bonus.entropyBits, 'number');
    assert.equal(typeof r.bonus.crackTimeSeconds, 'number');
    assert.equal(r.bonus.hasRepetition, true, '"aaaa..." doit etre vu comme une repetition');
    assert.equal(r.level, 'faible', 'le niveau officiel reste celui du cahier des charges (1 seul type)');

    const suite = analyzePassword('abcdefgh1234');
    assert.equal(suite.bonus.hasSequence, true, '"abcd" et "1234" sont des suites');
    assert.equal(suite.level, 'moyen', 'les bonus n\'influencent pas la classification');
  });

  test('l\'entropie vaut 0 pour la chaine vide et croit avec la longueur', () => {
    assert.equal(analyzePassword('').bonus.entropyBits, 0);
    const court = analyzePassword('aB1!aB1!').bonus.entropyBits;
    const long = analyzePassword('aB1!aB1!aB1!aB1!').bonus.entropyBits;
    assert.ok(long > court, 'un mot de passe plus long doit avoir une entropie plus elevee');
  });
});

/* =============================================================================
 * 16. CRITERES DYNAMIQUES — l'editeur de l'interface passe par ces fonctions
 * -----------------------------------------------------------------------------
 *    Chaque test remet les criteres du cahier des charges dans un `finally` :
 *    la configuration est un etat partage par tout le fichier.
 * ========================================================================== */

describe('16. Criteres dynamiques — reglages, paliers deduits, remise a zero', () => {
  test('par defaut, les criteres sont exactement ceux du cahier des charges', () => {
    assert.equal(isDefaultCriteria(), true);
    assert.deepEqual(
      getCriteria().filter((c) => c.enabled).map((c) => c.id),
      ['length', 'lowercase', 'uppercase', 'digits', 'special'],
    );
    assert.equal(findCriterion('length').min, 8);
    assert.deepEqual(activeTypeIds(), ['lowercase', 'uppercase', 'digits', 'special']);
  });

  test('allCriteria expose TOUS les criteres, criteria seulement les actifs', () => {
    const r = analyzePassword('abc');
    assert.equal(r.allCriteria.length, 8, '5 du cahier des charges + 3 proposes');
    assert.equal(r.criteria.length, 5, 'seuls les 5 actifs comptent');
    assert.ok(r.allCriteria.every((c) => typeof c.enabled === 'boolean'));
  });

  test('deplacer le seuil de longueur deplace les 4 paliers', () => {
    try {
      setCriterion('length', { min: 10 });
      assert.deepEqual(
        CONFIG.LEVELS.map((l) => [l.id, l.minLength, l.minTypes]),
        [['tres_fort', 18, 4], ['fort', 14, 3], ['moyen', 10, 2], ['faible', 0, 0]],
      );
      // 8 caracteres ne suffisent plus pour « Moyen ».
      assert.equal(analyzePassword('Abcdefg1').level, 'faible');
      assert.equal(analyzePassword('Abcdefghij1').level, 'moyen');
    } finally {
      resetCriteria();
    }
  });

  test('le seuil de longueur reste dans les bornes declarees', () => {
    try {
      setCriterion('length', { min: 999 });
      assert.equal(findCriterion('length').min, 32, 'plafonne a maxAllowed');
      setCriterion('length', { min: 1 });
      assert.equal(findCriterion('length').min, 4, 'plancher a minAllowed');
      setCriterion('length', { min: 'douze' });
      assert.equal(findCriterion('length').min, 4, 'une valeur absurde ne change rien');
    } finally {
      resetCriteria();
    }
  });

  test('l\'ecart entre paliers est reglable et borne', () => {
    try {
      setLevelGap(2);
      assert.deepEqual(CONFIG.LEVELS.map((l) => l.minLength), [12, 10, 8, 0]);
      setLevelGap(99);
      assert.equal(CONFIG.LEVEL_GAP, 8, 'plafonne a 8');
      setLevelGap(0);
      assert.equal(CONFIG.LEVEL_GAP, 1, 'plancher a 1');
    } finally {
      resetCriteria();
    }
  });

  test('desactiver un type le retire du decompte ET des exigences', () => {
    try {
      setCriterion('uppercase', { enabled: false });
      assert.deepEqual(activeTypeIds(), ['lowercase', 'digits', 'special']);
      // On n'exige jamais plus de types qu'il n'en reste.
      assert.deepEqual(CONFIG.LEVELS.map((l) => l.minTypes), [3, 3, 2, 0]);

      const r = analyzePassword('abcdefghijklmnop1!');
      assert.equal(r.typesCount, 3, 'la majuscule ne compte plus');
      assert.equal(r.level, 'tres_fort', '16 caracteres et les 3 types exiges');
      assert.equal(r.criteria.length, 4, 'la ligne « majuscule » sort de la check-list');
    } finally {
      resetCriteria();
    }
  });

  test('un critere « interdit » active fait perdre un niveau', () => {
    const avant = analyzePassword('Abcdefgh1234!xyz');
    assert.equal(avant.level, 'tres_fort');
    assert.equal(avant.bonus.penalizedLevels, 0, 'aucun critere interdit par defaut');

    try {
      setCriterion('no_sequence', { enabled: true });
      const apres = analyzePassword('Abcdefgh1234!xyz'); // contient « abcd » et « 1234 »
      assert.equal(apres.bonus.penalizedLevels, 1);
      assert.equal(apres.level, 'fort', 'un niveau perdu');
      assert.equal(apres.criteria.length, 6, 'le critere s\'ajoute a la check-list');
    } finally {
      resetCriteria();
    }
  });

  test('les criteres interdits cumulent leurs penalites', () => {
    try {
      setCriterion('no_sequence', { enabled: true });
      setCriterion('not_common', { enabled: true });
      // « Azerty123456! » : suite clavier + mot de passe courant.
      const r = analyzePassword('Azertyuiop123456!', COMMON_PASSWORDS);
      assert.ok(r.bonus.penalizedLevels >= 1, 'au moins une penalite');
      assert.ok(r.levelIndex < 3, 'le niveau maximal n\'est plus atteignable');
    } finally {
      resetCriteria();
    }
  });

  test('un critere desactive n\'influence plus rien', () => {
    try {
      setCriterion('special', { enabled: false });
      const r = analyzePassword('Abcdefghijklmnop1');
      assert.equal(r.criteria.length, 4);
      assert.equal(r.typesCount, 3, 'le caractere special ne compte plus');
      assert.equal(r.level, 'tres_fort', '17 caracteres, les 3 types exiges');
    } finally {
      resetCriteria();
    }
  });

  test('le score reste un nombre fini meme sans aucune exigence', () => {
    try {
      for (const id of ['length', 'lowercase', 'uppercase', 'digits', 'special']) {
        setCriterion(id, { enabled: false });
      }
      for (const mdp of ['', 'a', 'abc', 'Abcdefgh1!']) {
        const r = analyzePassword(mdp);
        assert.ok(Number.isFinite(r.score), `score non fini pour "${mdp}"`);
        assert.ok(r.score >= 0 && r.score <= 100, `score hors bornes pour "${mdp}"`);
      }
    } finally {
      resetCriteria();
    }
  });

  test('la chaine vide reste « Faible » meme sans aucun critere actif', () => {
    try {
      for (const c of getCriteria()) setCriterion(c.id, { enabled: false });
      const r = analyzePassword('');
      assert.equal(r.level, 'faible', 'un champ vide ne peut pas etre fort');
      assert.equal(r.levelIndex, 0);
      assert.equal(r.score, 0);
      assert.equal(r.isEmpty, true);
      // Un vrai mot de passe, lui, n'est plus contraint par rien.
      assert.equal(analyzePassword('a').level, 'tres_fort', 'plus aucune exigence');
    } finally {
      resetCriteria();
    }
  });

  test('CONFIG.LEVELS garde la meme reference tant que rien ne bouge', () => {
    const premier = CONFIG.LEVELS;
    assert.equal(CONFIG.LEVELS, premier, 'aucun changement : meme tableau');
    // classify() renvoie un element de CE tableau — l'identite doit tenir.
    assert.ok(premier.includes(classify(20, 4, true)));

    try {
      setCriterion('length', { min: 10 });
      assert.notEqual(CONFIG.LEVELS, premier, 'un reglage a change : nouveau tableau');
      assert.ok(CONFIG.LEVELS.includes(classify(20, 4, true)));
    } finally {
      resetCriteria();
    }
  });

  test('MIN_LENGTH_CRITERION reste un raccourci vers le critere de longueur', () => {
    try {
      CONFIG.MIN_LENGTH_CRITERION = 14;
      assert.equal(findCriterion('length').min, 14);
      assert.equal(CONFIG.MIN_LENGTH_CRITERION, 14);
      assert.equal(CONFIG.LEVELS.find((l) => l.id === 'moyen').minLength, 14);
    } finally {
      resetCriteria();
    }
    assert.equal(CONFIG.MIN_LENGTH_CRITERION, 8, 'configuration restauree');
  });

  test('export/import font un aller-retour fidele', () => {
    try {
      setCriterion('length', { min: 12 });
      setCriterion('digits', { enabled: false });
      setCriterion('no_repetition', { enabled: true });
      setLevelGap(3);

      const sauvegarde = JSON.parse(JSON.stringify(exportSettings()));
      resetCriteria();
      assert.equal(isDefaultCriteria(), true, 'remise a zero effective');

      importSettings(sauvegarde);
      assert.equal(findCriterion('length').min, 12);
      assert.equal(findCriterion('digits').enabled, false);
      assert.equal(findCriterion('no_repetition').enabled, true);
      assert.equal(CONFIG.LEVEL_GAP, 3);
    } finally {
      resetCriteria();
    }
  });

  test('importSettings ignore ce qu\'il ne comprend pas', () => {
    try {
      importSettings(null);
      importSettings('nimporte quoi');
      importSettings({ criteria: { inconnu: { enabled: true } }, gap: 'trois' });
      assert.equal(isDefaultCriteria(), true, 'rien n\'a bouge');

      importSettings({ criteria: { length: { min: 1000 } } });
      assert.equal(findCriterion('length').min, 32, 'valeur bornee, pas rejetee');
    } finally {
      resetCriteria();
    }
  });

  test('resetCriteria() rend une configuration identique au cahier des charges', () => {
    setCriterion('length', { min: 20 });
    setCriterion('special', { enabled: false });
    setLevelGap(7);
    assert.equal(isDefaultCriteria(), false);

    resetCriteria();
    assert.equal(isDefaultCriteria(), true);
    assert.deepEqual(
      CONFIG.LEVELS.map((l) => [l.id, l.minLength, l.minTypes]),
      [['tres_fort', 16, 4], ['fort', 12, 3], ['moyen', 8, 2], ['faible', 0, 0]],
    );
  });

  test('getCriteria() rend une copie : la modifier ne touche pas le moteur', () => {
    const copie = getCriteria();
    copie[0].min = 99;
    copie[1].enabled = false;
    assert.equal(findCriterion('length').min, 8);
    assert.equal(findCriterion('lowercase').enabled, true);
  });
});
