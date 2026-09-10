/**
 * =============================================================================
 *  strength.js — MOTEUR D'ANALYSE DE LA FORCE D'UN MOT DE PASSE
 *  Ядро анализа надёжности пароля
 * =============================================================================
 *
 *  FR : Implémentation exacte des règles du cahier des charges
 *       « Application de vérification de la force d'un mot de passe ».
 *  RU : Точная реализация правил из ТЗ. Всё, что можно менять, — в блоке CONFIG.
 *
 *  Ce fichier est un module ES pur, SANS aucune dépendance.
 *  Il fonctionne à l'identique dans le navigateur (Mini App) et dans Node.js (bot).
 *  --> Une seule source de vérité pour les règles. / Один источник правды.
 *
 *  L'analyse est 100 % locale : le mot de passe ne quitte JAMAIS l'appareil.
 *  Анализ 100% локальный: пароль никогда не покидает устройство.
 * =============================================================================
 */

/* =============================================================================
 * 1. CONFIG — ЕДИНСТВЕННОЕ МЕСТО, ГДЕ НУЖНО ЧТО-ТО МЕНЯТЬ
 * ============================================================================= */

export const CONFIG = {
  /**
   * FR : Les 4 niveaux du cahier des charges, du plus fort au plus faible.
   *      L'évaluation se fait DE HAUT EN BAS : le premier niveau dont toutes
   *      les conditions sont remplies gagne.
   * RU : 4 уровня из ТЗ, от сильного к слабому. Проверка идёт СВЕРХУ ВНИЗ:
   *      побеждает первый уровень, все условия которого выполнены.
   *
   *  minLength = longueur minimale (en points de code Unicode)
   *  minTypes  = nombre minimal de types de caractères parmi les 4
   */
  LEVELS: [
    { id: 'tres_fort', index: 3, minLength: 16, minTypes: 4 }, // Très fort
    { id: 'fort',      index: 2, minLength: 12, minTypes: 3 }, // Fort
    { id: 'moyen',     index: 1, minLength: 8,  minTypes: 2 }, // Moyen
    { id: 'faible',    index: 0, minLength: 0,  minTypes: 0 }, // Faible (par défaut)
  ],

  /**
   * FR : Longueur minimale affichée dans la liste des critères (cahier des
   *      charges : « Longueur minimale (ex. : >= 8 caractères) »).
   * RU : Минимальная длина, показываемая в чек-листе критериев.
   */
  MIN_LENGTH_CRITERION: 8,

  /**
   * FR : Le cahier des charges liste « Aucun caractère spécial » comme un
   *      critère de « Faible ». Pris au pied de la lettre, cela contredit la
   *      règle « Moyen » (>= 2 types suffisent). Par défaut nous suivons la
   *      lecture cohérente (règles 2/3/4 font foi). Mettre à `true` pour forcer
   *      « Faible » dès qu'il n'y a aucun caractère spécial.
   * RU : В ТЗ «нет спецсимволов» указано как признак «Faible», но это
   *      противоречит правилу «Moyen» (достаточно 2 типов). По умолчанию
   *      используем непротиворечивое чтение. Поставь `true`, если препод
   *      требует буквальное: без спецсимвола — сразу «Faible».
   */
  STRICT_SPECIAL_CHAR_RULE: false,

  /**
   * FR : Si `true`, un mot de passe figurant dans la liste des mots de passe
   *      les plus courants est rétrogradé en « Faible ».
   *      Par défaut `false` pour rester STRICTEMENT conforme au cahier des
   *      charges ; l'avertissement reste affiché dans tous les cas.
   * RU : Если `true` — пароль из списка самых частых понижается до «Faible».
   *      По умолчанию `false`, чтобы строго соответствовать ТЗ.
   *      Предупреждение показывается в любом случае.
   */
  DOWNGRADE_COMMON_PASSWORDS: false,

  /**
   * FR : `true`  = détection Unicode (é, ß, Ж comptent comme des lettres).
   *      `false` = mode ASCII strict (a-z, A-Z, 0-9, le reste = spécial).
   * RU : Unicode-режим или строгий ASCII.
   */
  UNICODE_AWARE: true,

  /**
   * FR : Vitesse d'attaque supposée pour l'estimation du temps de cassage
   *      (attaque hors ligne sur GPU, hachage rapide). Indicatif uniquement.
   * RU : Предполагаемая скорость перебора для оценки времени взлома.
   */
  GUESSES_PER_SECOND: 1e10,
};

/* =============================================================================
 * 2. DÉTECTION DES TYPES DE CARACTÈRES / Определение типов символов
 * ============================================================================= */

/**
 * FR : Les 4 types de caractères du cahier des charges.
 * RU : 4 типа символов из ТЗ.
 */
const MATCHERS = {
  unicode: {
    lowercase: /\p{Ll}/u,              // minuscules  / строчные
    uppercase: /\p{Lu}|\p{Lt}/u,       // majuscules  / заглавные
    digits:    /\p{Nd}/u,              // chiffres    / цифры
    special:   /[^\p{L}\p{N}]/u,       // spéciaux    / спецсимволы (всё, что не буква и не цифра)
  },
  ascii: {
    lowercase: /[a-z]/,
    uppercase: /[A-Z]/,
    digits:    /[0-9]/,
    special:   /[^a-zA-Z0-9]/,
  },
};

export const TYPE_IDS = ['lowercase', 'uppercase', 'digits', 'special'];

/**
 * FR : Retourne quels types de caractères sont présents.
 * RU : Возвращает, какие типы символов присутствуют.
 * @param {string} password
 * @returns {{lowercase:boolean, uppercase:boolean, digits:boolean, special:boolean}}
 */
export function detectTypes(password) {
  const m = CONFIG.UNICODE_AWARE ? MATCHERS.unicode : MATCHERS.ascii;
  return {
    lowercase: m.lowercase.test(password),
    uppercase: m.uppercase.test(password),
    digits:    m.digits.test(password),
    special:   m.special.test(password),
  };
}

/**
 * FR : Longueur en points de code Unicode (un emoji = 1 caractère, pas 2).
 * RU : Длина в кодовых точках Unicode (эмодзи = 1 символ, а не 2).
 * @param {string} password
 * @returns {number}
 */
export function codePointLength(password) {
  return [...password].length;
}

/* =============================================================================
 * 3. RÈGLE PRINCIPALE / Главное правило — классификация уровня
 * ============================================================================= */

/**
 * FR : Applique les règles de classification du cahier des charges.
 * RU : Применяет правила классификации из ТЗ.
 * @param {number} length     longueur du mot de passe
 * @param {number} typesCount nombre de types présents (0..4)
 * @param {boolean} hasSpecial
 * @returns {{id:string, index:number, minLength:number, minTypes:number}}
 */
export function classify(length, typesCount, hasSpecial) {
  // Règle stricte optionnelle : pas de caractère spécial => Faible
  if (CONFIG.STRICT_SPECIAL_CHAR_RULE && !hasSpecial) {
    return CONFIG.LEVELS[CONFIG.LEVELS.length - 1]; // faible
  }
  for (const level of CONFIG.LEVELS) {
    if (length >= level.minLength && typesCount >= level.minTypes) return level;
  }
  return CONFIG.LEVELS[CONFIG.LEVELS.length - 1]; // faible (filet de sécurité)
}

/* =============================================================================
 * 4. SCORE CONTINU (0..100) POUR LA BARRE DE PROGRESSION
 *    Плавный счёт 0..100 для анимации полоски
 * ============================================================================= */

/**
 * FR : Le cahier des charges ne demande que 4 niveaux discrets. Pour que la
 *      barre bouge joliment pendant la frappe, on calcule un score continu :
 *      25 points par palier atteint + progression vers le palier suivant.
 *      Ce score est purement visuel, il ne change JAMAIS le niveau officiel.
 * RU : Полоска двигается плавно: 25 очков за каждый достигнутый уровень +
 *      прогресс к следующему. Это только визуал, на официальный уровень не влияет.
 */
export function computeScore(length, typesCount, level) {
  if (length === 0) return 0;
  const base = level.index * 25;
  if (level.index === 3) return 100;

  const next = CONFIG.LEVELS.find((l) => l.index === level.index + 1);
  const lengthProgress = Math.min(1, length / next.minLength);
  const typesProgress  = Math.min(1, typesCount / next.minTypes);
  const progress = (lengthProgress + typesProgress) / 2;

  return Math.round(Math.min(base + progress * 25, base + 24));
}

/* =============================================================================
 * 5. ANALYSES BONUS (hors cahier des charges, clairement identifiées)
 *    Бонусные проверки — сверх ТЗ, помечены как бонус
 * ============================================================================= */

/** Taille de l'alphabet utilisé, pour l'entropie. / Размер алфавита для энтропии. */
function alphabetSize(types) {
  let n = 0;
  if (types.lowercase) n += 26;
  if (types.uppercase) n += 26;
  if (types.digits)    n += 10;
  if (types.special)   n += 33; // ponctuation ASCII imprimable
  return n || 1;
}

/**
 * FR : Entropie « naïve » en bits = longueur x log2(taille de l'alphabet).
 *      C'est une borne HAUTE : un mot de passe du dictionnaire est bien plus
 *      faible que son entropie ne le laisse croire.
 * RU : «Наивная» энтропия в битах. Это ВЕРХНЯЯ оценка.
 */
export function entropyBits(password, types) {
  const len = codePointLength(password);
  if (len === 0) return 0;
  return Math.round(len * Math.log2(alphabetSize(types)) * 10) / 10;
}

/** Répétition : « aaaa », « abcabcabc ». / Повторы. */
export function hasRepetition(password) {
  return /(.)\1{2,}/u.test(password) || /^(.{1,4}?)\1{2,}$/u.test(password);
}

/** Suite : « abcd », « 1234 », « qwerty ». / Последовательности. */
export function hasSequence(password) {
  const p = password.toLowerCase();
  const runs = ['abcdefghijklmnopqrstuvwxyz', '0123456789', 'qwertyuiop', 'azertyuiop', 'asdfghjkl', 'zxcvbnm'];
  for (const run of runs) {
    for (let i = 0; i + 4 <= run.length; i++) {
      const chunk = run.slice(i, i + 4);
      const reversed = [...chunk].reverse().join('');
      if (p.includes(chunk) || p.includes(reversed)) return true;
    }
  }
  return false;
}

/**
 * FR : Estimation indicative du temps de cassage hors ligne, en secondes.
 * RU : Ориентировочное время перебора офлайн, в секундах.
 */
export function crackTimeSeconds(bits) {
  if (bits <= 0) return 0;
  const guesses = Math.pow(2, Math.min(bits, 1024)) / 2; // en moyenne la moitié
  return guesses / CONFIG.GUESSES_PER_SECOND;
}

/* =============================================================================
 * 6. FONCTION PRINCIPALE / Главная функция
 * ============================================================================= */

/**
 * FR : Analyse complète d'un mot de passe.
 * RU : Полный анализ пароля.
 *
 * @param {string} password
 * @param {Set<string>|Array<string>|null} commonPasswords liste optionnelle
 * @returns {object} résultat structuré (voir README / DOCS)
 */
export function analyzePassword(password, commonPasswords = null) {
  const pwd = typeof password === 'string' ? password : '';
  const length = codePointLength(pwd);
  const types = detectTypes(pwd);
  const typesCount = TYPE_IDS.reduce((n, id) => n + (types[id] ? 1 : 0), 0);

  // --- Mot de passe courant ? / Частый пароль? ---------------------------
  const isCommon = isCommonPassword(pwd, commonPasswords);

  // --- Niveau officiel (cahier des charges) / Официальный уровень --------
  let level = classify(length, typesCount, types.special);
  let downgraded = false;
  if (CONFIG.DOWNGRADE_COMMON_PASSWORDS && isCommon && level.index > 0) {
    level = CONFIG.LEVELS[CONFIG.LEVELS.length - 1]; // faible
    downgraded = true;
  }

  // --- Critères affichés à l'écran / Критерии для чек-листа --------------
  const criteria = [
    { id: 'length',    ok: length >= CONFIG.MIN_LENGTH_CRITERION, value: length },
    { id: 'lowercase', ok: types.lowercase },
    { id: 'uppercase', ok: types.uppercase },
    { id: 'digits',    ok: types.digits },
    { id: 'special',   ok: types.special },
  ];

  // --- Que faire pour monter d'un niveau ? / Что нужно для след. уровня --
  const next = CONFIG.LEVELS.find((l) => l.index === level.index + 1) || null;
  const nextLevel = next
    ? {
        id: next.id,
        missingLength: Math.max(0, next.minLength - length),
        missingTypes: Math.max(0, next.minTypes - typesCount),
      }
    : null;

  const bits = entropyBits(pwd, types);

  return {
    password: undefined,          // jamais renvoyé / никогда не возвращаем пароль
    length,
    types,
    typesCount,
    level: level.id,              // 'faible' | 'moyen' | 'fort' | 'tres_fort'
    levelIndex: level.index,      // 0 | 1 | 2 | 3
    score: computeScore(length, typesCount, level),
    criteria,
    nextLevel,
    isEmpty: length === 0,
    // ---- bonus (hors cahier des charges) / бонус (сверх ТЗ) ----
    bonus: {
      isCommon,
      downgraded,
      entropyBits: bits,
      crackTimeSeconds: crackTimeSeconds(bits),
      hasRepetition: hasRepetition(pwd),
      hasSequence: hasSequence(pwd),
    },
  };
}

/* =============================================================================
 * 7. LISTE DES MOTS DE PASSE LES PLUS COURANTS / Список частых паролей
 * ============================================================================= */

export const COMMON_PASSWORDS = new Set([
  '123456', '123456789', '12345678', '1234567', '12345', '1234567890', '1234',
  '111111', '000000', '123123', '654321', '666666', '112233', '121212', '999999',
  'password', 'password1', 'password123', 'passw0rd', 'motdepasse', 'motdepasse1',
  'azerty', 'azertyuiop', 'qwerty', 'qwertyuiop', 'qwerty123', 'qwertz', 'asdfgh',
  'abc123', 'a123456', 'abcdef', 'abcd1234', 'iloveyou', 'admin', 'admin123',
  'root', 'toor', 'letmein', 'welcome', 'monkey', 'dragon', 'sunshine', 'princess',
  'football', 'baseball', 'superman', 'batman', 'trustno1', 'master', 'shadow',
  'michael', 'jennifer', 'jordan', 'hunter', 'ranger', 'soleil', 'bonjour',
  'chocolat', 'doudou', 'nicolas', 'julien', 'camille', 'marseille', 'loulou',
  'coucou', 'chouchou', 'amour', 'famille', 'bonjour1', 'jetaime', 'test',
  'test123', 'guest', 'user', 'login', 'changeme', 'secret', 'default',
  'p@ssw0rd', 'p@ssword', 'passw0rd1', 'qazwsx', 'zxcvbnm', '1q2w3e4r', '1qaz2wsx',
  'qwe123', 'asd123', '147258369', '159753', '789456', 'aaaaaa', 'zzzzzz',
  'пароль', 'привет', 'любовь', 'россия', 'йцукен', 'марина', 'наташа', 'сергей',
]);

/**
 * FR : Le mot de passe figure-t-il dans la liste des plus courants ?
 *      On teste aussi la version minuscule et sans chiffres/! à la fin,
 *      car « Password123! » n'est pas plus sûr que « password ».
 * RU : Есть ли пароль в списке частых? Проверяем также нижний регистр
 *      и версию без хвостовых цифр/знаков.
 */
export function isCommonPassword(password, list = null) {
  if (!password) return false;
  const set = list instanceof Set ? list : Array.isArray(list) ? new Set(list) : COMMON_PASSWORDS;
  const lower = password.toLowerCase();
  const stripped = lower.replace(/[0-9!@#$%^&*._-]+$/u, '');
  return set.has(password) || set.has(lower) || (stripped.length >= 4 && set.has(stripped));
}

/* =============================================================================
 * 8. GÉNÉRATEUR DE MOT DE PASSE FORT / Генератор надёжного пароля (бонус)
 * ============================================================================= */

const POOLS = {
  lowercase: 'abcdefghijkmnopqrstuvwxyz',   // sans « l » (confusion avec 1)
  uppercase: 'ABCDEFGHJKLMNPQRSTUVWXYZ',    // sans « I » et « O »
  digits:    '23456789',                    // sans 0 et 1
  special:   '!@#$%^&*()-_=+[]{}:;,.?/',
};

/** Entier aléatoire cryptographiquement sûr. / Криптостойкое случайное число. */
function secureRandomInt(max) {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const limit = Math.floor(0xffffffff / max) * max;
    const buf = new Uint32Array(1);
    let v;
    do { cryptoObj.getRandomValues(buf); v = buf[0]; } while (v >= limit);
    return v % max;
  }
  return Math.floor(Math.random() * max); // repli / запасной вариант
}

/**
 * FR : Génère un mot de passe garanti « Très fort » (>= 16 caractères, 4 types).
 * RU : Генерирует пароль, гарантированно «Très fort» (>=16 символов, 4 типа).
 * @param {number} length
 * @returns {string}
 */
export function generateStrongPassword(length = 20) {
  const size = Math.max(16, Math.min(64, Math.floor(length) || 20));
  const chars = [];
  // Au moins un caractère de chaque type / хотя бы по одному символу каждого типа
  for (const pool of Object.values(POOLS)) chars.push(pool[secureRandomInt(pool.length)]);
  const all = Object.values(POOLS).join('');
  while (chars.length < size) chars.push(all[secureRandomInt(all.length)]);
  // Mélange de Fisher-Yates / перемешивание Фишера-Йетса
  for (let i = chars.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export default { analyzePassword, generateStrongPassword, classify, detectTypes, CONFIG };
