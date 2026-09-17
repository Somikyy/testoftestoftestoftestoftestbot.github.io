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
 * -----------------------------------------------------------------------------
 *  FR : Les critères ne sont PLUS écrits en dur, ni ici ni dans le HTML. Ils
 *       vivent tous dans `CONFIG.CRITERIA`, une simple liste de descriptions.
 *       L'écran construit ses lignes à partir de cette liste, et les paliers
 *       (Faible / Moyen / Fort / Très fort) en sont DÉDUITS. Modifier un
 *       critère met donc à jour la check-list ET la notation.
 *  RU : Критерии больше не зашиты — ни здесь, ни в HTML. Все они в
 *       CONFIG.CRITERIA. Интерфейс строит строки из этого списка, а уровни
 *       ВЫВОДЯТСЯ из него: меняешь критерий — меняется и чек-лист, и оценка.
 * ============================================================================= */

/**
 * FR : Les paliers du cahier des charges, exprimés RELATIVEMENT au critère de
 *      longueur. Avec les réglages par défaut (longueur minimale = 8, écart
 *      entre paliers = 4) on retrouve EXACTEMENT le barème demandé :
 *      Moyen >= 8 car. / 2 types, Fort >= 12 / 3, Très fort >= 16 / 4.
 * RU : Уровни заданы ОТНОСИТЕЛЬНО критерия длины. При значениях по умолчанию
 *      (мин. длина 8, шаг 4) получается ровно ТЗ: 8/2, 12/3, 16/4.
 *
 *  lengthSteps = nombre d'écarts ajoutés à la longueur minimale (null = aucune)
 *  minTypes    = types exigés, plafonné au nombre de types réellement actifs
 */
const LEVEL_SPEC = [
  { id: 'tres_fort', index: 3, lengthSteps: 2,    minTypes: 4 },
  { id: 'fort',      index: 2, lengthSteps: 1,    minTypes: 3 },
  { id: 'moyen',     index: 1, lengthSteps: 0,    minTypes: 2 },
  { id: 'faible',    index: 0, lengthSteps: null, minTypes: 0 },
];

/**
 * FR : Les critères livrés par défaut — la check-list du cahier des charges.
 *      Cette liste est la RÉFÉRENCE IMMUABLE : `resetCriteria()` y revient.
 * RU : Критерии по умолчанию — чек-лист из ТЗ. Это эталон, к которому
 *      возвращает resetCriteria().
 *
 *  kind: 'length' — seuil numérique réglable (`min`), borné par min/maxAllowed
 *  kind: 'type'   — exige un type de caractère ; compte pour la classification
 *  kind: 'forbid' — interdit un défaut ; son échec fait PERDRE des niveaux
 *
 *  enabled: false = critère proposé mais désactivé (invisible tant qu'on
 *  n'ouvre pas l'éditeur). Les trois derniers sont des bonus hors cahier
 *  des charges : les activer, c'est sortir du barème demandé.
 */
const DEFAULT_CRITERIA = [
  { id: 'length',        kind: 'length', enabled: true,  min: 8, minAllowed: 4, maxAllowed: 32 },
  { id: 'lowercase',     kind: 'type',   enabled: true,  type: 'lowercase' },
  { id: 'uppercase',     kind: 'type',   enabled: true,  type: 'uppercase' },
  { id: 'digits',        kind: 'type',   enabled: true,  type: 'digits' },
  { id: 'special',       kind: 'type',   enabled: true,  type: 'special' },
  { id: 'no_repetition', kind: 'forbid', enabled: false, check: 'repetition', bonus: true },
  { id: 'no_sequence',   kind: 'forbid', enabled: false, check: 'sequence',   bonus: true },
  { id: 'not_common',    kind: 'forbid', enabled: false, check: 'common',     bonus: true },
];

/** Copie profonde d'un descripteur de critère. / Глубокая копия критерия. */
const cloneCriterion = (criterion) => ({ ...criterion });

/**
 * Cache des paliers calculés.
 * FR : `CONFIG.LEVELS` doit renvoyer TOUJOURS LE MÊME tableau tant que les
 *      réglages ne bougent pas — sinon `classify()` renverrait des objets que
 *      `CONFIG.LEVELS.includes(...)` ne reconnaîtrait plus.
 * RU : CONFIG.LEVELS должен возвращать ОДИН И ТОТ ЖЕ массив, пока настройки не
 *      менялись, иначе сравнение по ссылке перестанет работать.
 */
let levelsCache = [];
let levelsSignature = null;

export const CONFIG = {
  /**
   * FR : LA liste des critères. Tout part d'ici : la check-list affichée, le
   *      nombre de types exigés, et les seuils de longueur des paliers.
   * RU : ГЛАВНЫЙ список критериев. Отсюда берётся всё: чек-лист, количество
   *      требуемых типов и пороги длины для уровней.
   */
  CRITERIA: DEFAULT_CRITERIA.map(cloneCriterion),

  /**
   * FR : Écart de longueur entre deux paliers consécutifs.
   *      8 (minimum) -> Moyen 8, Fort 8+4=12, Très fort 8+8=16.
   * RU : Шаг длины между уровнями. 8 -> 8 / 12 / 16.
   */
  LEVEL_GAP: 4,

  /**
   * FR : Nombre de niveaux perdus par critère « interdit » (kind: 'forbid')
   *      non respecté. 0 = les critères interdits restent purement indicatifs.
   * RU : Сколько уровней теряется за каждый нарушенный «запрещающий» критерий.
   */
  FORBID_PENALTY: 1,

  /**
   * FR : Les 4 paliers, RECALCULÉS à partir des critères actifs.
   *      Lecture seule : pour changer les seuils, on change les critères
   *      (`setCriterion('length', { min: 10 })`) ou `LEVEL_GAP`.
   * RU : 4 уровня, ПЕРЕСЧИТАННЫЕ из активных критериев. Только для чтения.
   */
  get LEVELS() {
    refreshLevels();
    return levelsCache;
  },

  /**
   * FR : Raccourci historique vers le seuil du critère de longueur.
   *      Lire ET écrire restent possibles : `CONFIG.MIN_LENGTH_CRITERION = 10`
   *      revient à `setCriterion('length', { min: 10 })`.
   * RU : Историческое сокращение для порога длины: читается и пишется.
   */
  get MIN_LENGTH_CRITERION() {
    const criterion = findCriterion('length');
    return criterion ? criterion.min : 0;
  },
  set MIN_LENGTH_CRITERION(value) {
    setCriterion('length', { min: value });
  },

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
 * 1 bis. CRITÈRES DYNAMIQUES — lecture, écriture, remise à zéro
 *        Динамические критерии: чтение, запись, сброс
 * ============================================================================= */

/** Descripteur d'un critère, par identifiant. / Критерий по идентификатору. */
export function findCriterion(id) {
  return CONFIG.CRITERIA.find((criterion) => criterion.id === id) || null;
}

/** Copie des critères — sûre à manipuler (l'écran ne modifie jamais l'original). */
export function getCriteria() {
  return CONFIG.CRITERIA.map(cloneCriterion);
}

/** Identifiants des types de caractères RÉELLEMENT exigés (0 à 4). */
export function activeTypeIds() {
  return CONFIG.CRITERIA
    .filter((criterion) => criterion.kind === 'type' && criterion.enabled)
    .map((criterion) => criterion.type);
}

/** Borne une valeur de seuil dans les limites déclarées par le critère. */
function clampMin(criterion, value) {
  const wanted = Math.round(Number(value));
  if (!Number.isFinite(wanted)) return criterion.min;
  const low = criterion.minAllowed ?? 0;
  const high = criterion.maxAllowed ?? 64;
  return Math.max(low, Math.min(high, wanted));
}

/**
 * FR : Modifie un critère. C'est LE point d'entrée utilisé par l'éditeur de
 *      l'interface. Renvoie le critère mis à jour, ou `null` s'il n'existe pas.
 * RU : Меняет критерий — единственная точка входа для редактора в интерфейсе.
 *
 * @param {string} id
 * @param {{enabled?: boolean, min?: number}} patch
 */
export function setCriterion(id, patch = {}) {
  const criterion = findCriterion(id);
  if (!criterion) return null;

  if (typeof patch.enabled === 'boolean') criterion.enabled = patch.enabled;
  if (patch.min !== undefined && criterion.kind === 'length') {
    criterion.min = clampMin(criterion, patch.min);
  }
  return criterion;
}

/** Écart de longueur entre deux paliers (1 à 8). / Шаг длины между уровнями. */
export function setLevelGap(value) {
  const wanted = Math.round(Number(value));
  if (Number.isFinite(wanted)) CONFIG.LEVEL_GAP = Math.max(1, Math.min(8, wanted));
  return CONFIG.LEVEL_GAP;
}

/** Retour aux critères du cahier des charges. / Возврат к критериям из ТЗ. */
export function resetCriteria() {
  CONFIG.CRITERIA = DEFAULT_CRITERIA.map(cloneCriterion);
  CONFIG.LEVEL_GAP = 4;
  return getCriteria();
}

/** Les réglages sont-ils ceux du cahier des charges ? / Настройки — как в ТЗ? */
export function isDefaultCriteria() {
  if (CONFIG.LEVEL_GAP !== 4) return false;
  return DEFAULT_CRITERIA.every((reference) => {
    const criterion = findCriterion(reference.id);
    if (!criterion) return false;
    if (criterion.enabled !== reference.enabled) return false;
    return reference.kind !== 'length' || criterion.min === reference.min;
  });
}

/**
 * FR : Réglages sous une forme minimale, prête à être mémorisée (JSON).
 *      On n'enregistre QUE ce qui est réglable — jamais de mot de passe.
 * RU : Настройки в минимальной форме для сохранения. Пароли — никогда.
 */
export function exportSettings() {
  const criteria = {};
  for (const criterion of CONFIG.CRITERIA) {
    criteria[criterion.id] = criterion.kind === 'length'
      ? { enabled: criterion.enabled, min: criterion.min }
      : { enabled: criterion.enabled };
  }
  return { gap: CONFIG.LEVEL_GAP, criteria };
}

/**
 * FR : Recharge des réglages mémorisés. Tolérant : une clé inconnue, une
 *      valeur absurde ou un objet corrompu sont ignorés sans rien casser.
 * RU : Загружает сохранённые настройки. Всё непонятное молча игнорируется.
 */
export function importSettings(settings) {
  if (!settings || typeof settings !== 'object') return getCriteria();

  if (settings.gap !== undefined) setLevelGap(settings.gap);

  const criteria = settings.criteria;
  if (criteria && typeof criteria === 'object') {
    for (const [id, patch] of Object.entries(criteria)) {
      if (patch && typeof patch === 'object') setCriterion(id, patch);
    }
  }
  return getCriteria();
}

/**
 * FR : Recalcule les 4 paliers à partir des critères actifs — mais seulement
 *      si quelque chose a réellement changé (voir `levelsCache`).
 * RU : Пересчитывает 4 уровня из активных критериев — только если что-то
 *      действительно изменилось.
 */
function refreshLevels() {
  const lengthCriterion = findCriterion('length');
  // Critère de longueur désactivé => la longueur ne compte PLUS NULLE PART,
  // exactement comme un type qu'on décoche. Tous les seuils tombent à 0.
  const withLength = Boolean(lengthCriterion && lengthCriterion.enabled);
  const base = withLength ? lengthCriterion.min : 0;
  const types = activeTypeIds();
  const signature = `${withLength}|${base}|${CONFIG.LEVEL_GAP}|${types.join(',')}`;

  if (signature === levelsSignature) return levelsCache;
  levelsSignature = signature;

  levelsCache = LEVEL_SPEC.map((spec) => ({
    id: spec.id,
    index: spec.index,
    minLength: withLength && spec.lengthSteps !== null
      ? base + spec.lengthSteps * CONFIG.LEVEL_GAP
      : 0,
    // On n'exige jamais plus de types qu'il n'en reste d'actifs.
    minTypes: Math.min(spec.minTypes, types.length),
  }));
  return levelsCache;
}

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
  if (!next) return 100;

  // Un seuil à 0 (critère désactivé dans l'éditeur) est DÉJÀ atteint : sans
  // cette garde, la division donnerait NaN et la barre se figerait.
  const lengthProgress = next.minLength > 0 ? Math.min(1, length / next.minLength) : 1;
  const typesProgress  = next.minTypes  > 0 ? Math.min(1, typesCount / next.minTypes) : 1;
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
 * FR : Évalue TOUS les critères déclarés dans `CONFIG.CRITERIA`, activés ou non.
 *      Chaque ligne de la check-list de l'écran est construite à partir d'un
 *      élément de ce tableau : ajouter un critère au CONFIG suffit pour le voir
 *      apparaître, sans écrire une seule ligne de HTML.
 * RU : Оценивает ВСЕ критерии из CONFIG.CRITERIA — включённые и выключенные.
 *      Каждая строка чек-листа строится из элемента этого массива: добавил
 *      критерий в конфиг — строка появилась, HTML править не нужно.
 *
 * @param {number} length longueur en points de code
 * @param {object} types  types de caractères détectés
 * @param {{common:boolean, repetition:boolean, sequence:boolean}} flags
 */
function evaluateCriteria(length, types, flags) {
  return CONFIG.CRITERIA.map((criterion) => {
    const row = {
      id: criterion.id,
      kind: criterion.kind,
      enabled: criterion.enabled,
      bonus: Boolean(criterion.bonus),
      ok: true,
    };

    switch (criterion.kind) {
      case 'length':
        row.min = criterion.min;
        row.value = length;
        row.ok = length >= criterion.min;
        break;

      case 'type':
        row.type = criterion.type;
        row.ok = Boolean(types[criterion.type]);
        break;

      case 'forbid':
        // Un critère « interdit » est rempli tant que le défaut est ABSENT.
        row.check = criterion.check;
        row.ok = !flags[criterion.check];
        break;

      default:
        row.ok = true;
    }

    return row;
  });
}

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

  // Seuls les types RÉELLEMENT exigés comptent : décocher « majuscule » dans
  // l'éditeur le retire du décompte ET des paliers, tout est cohérent.
  // Только ДЕЙСТВИТЕЛЬНО требуемые типы идут в счёт.
  const typesCount = activeTypeIds().reduce((n, id) => n + (types[id] ? 1 : 0), 0);

  // --- Défauts repérés (servent aux critères « interdits ») --------------
  const isCommon = isCommonPassword(pwd, commonPasswords);
  const repetition = hasRepetition(pwd);
  const sequence = hasSequence(pwd);

  // --- Critères : TOUS évalués ; les désactivés restent visibles pour
  //     l'éditeur de l'interface, mais ne comptent pour rien.
  const allCriteria = evaluateCriteria(length, types, {
    common: isCommon,
    repetition,
    sequence,
  });
  const criteria = allCriteria.filter((criterion) => criterion.enabled);

  // --- Niveau officiel (cahier des charges) / Официальный уровень --------
  // Un champ VIDE reste toujours au plus bas : sans cette garde, désactiver
  // tous les critères dans l'éditeur rendrait la chaîne vide « Très fort ».
  // Пустое поле всегда на самом низком уровне.
  let level = length === 0
    ? CONFIG.LEVELS[CONFIG.LEVELS.length - 1]
    : classify(length, typesCount, types.special);

  // Chaque critère « interdit » non respecté fait perdre FORBID_PENALTY niveaux.
  // Aucun n'est actif par défaut : le barème du cahier des charges est intact.
  const penalty = criteria.filter((c) => c.kind === 'forbid' && !c.ok).length
                  * CONFIG.FORBID_PENALTY;
  if (penalty > 0 && level.index > 0) {
    const target = Math.max(0, level.index - penalty);
    level = CONFIG.LEVELS.find((l) => l.index === target) || level;
  }

  let downgraded = false;
  if (CONFIG.DOWNGRADE_COMMON_PASSWORDS && isCommon && level.index > 0) {
    level = CONFIG.LEVELS[CONFIG.LEVELS.length - 1]; // faible
    downgraded = true;
  }

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
    criteria,                     // critères ACTIFS (check-list officielle)
    allCriteria,                  // + les critères désactivés, pour l'éditeur
    nextLevel,
    isEmpty: length === 0,
    // ---- bonus (hors cahier des charges) / бонус (сверх ТЗ) ----
    bonus: {
      isCommon,
      downgraded,
      penalizedLevels: penalty,
      entropyBits: bits,
      crackTimeSeconds: crackTimeSeconds(bits),
      hasRepetition: repetition,
      hasSequence: sequence,
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

export default {
  analyzePassword, generateStrongPassword, classify, detectTypes, CONFIG,
  getCriteria, setCriterion, setLevelGap, resetCriteria, isDefaultCriteria,
  exportSettings, importSettings,
};
