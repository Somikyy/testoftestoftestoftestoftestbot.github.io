/**
 * =============================================================================
 *  i18n.js — INTERNATIONALISATION (FR / RU / EN)
 * =============================================================================
 *  Le français est la langue de référence : toute clé manquante dans `ru`/`en`
 *  retombe automatiquement sur la version française.
 *
 *  Une chaîne peut contenir plusieurs formes séparées par « | » (singulier |
 *  pluriel | pluriel 2). La forme est choisie par `pluralIndex()` en fonction
 *  de la variable `{n}` passée à `t()`.
 * =============================================================================
 */

/* =============================================================================
 * 1. LANGUES DISPONIBLES
 * ============================================================================= */

/** Ordre d'affichage des puces de langue dans l'en-tête. */
export const LANGS = ['fr', 'ru', 'en'];

/** Libellé court affiché sur chaque puce. */
export const LANG_LABELS = { fr: 'FR', ru: 'RU', en: 'EN' };

/** Locale complète, utilisée par `Intl.NumberFormat`. */
const LOCALES = { fr: 'fr-FR', ru: 'ru-RU', en: 'en-US' };

/** Langue par défaut imposée par le cahier des charges. */
export const DEFAULT_LANG = 'fr';

/* =============================================================================
 * 2. TABLE DES CHAÎNES
 * ============================================================================= */

export const STRINGS = {
  /* ----------------------------- FRANÇAIS -------------------------------- */
  fr: {
    app_title: 'Force du mot de passe',
    app_subtitle: 'Analyse en temps réel, directement sur votre appareil.',
    lang_label: 'Choisir la langue',

    // Niveaux du cahier des charges
    level_empty: 'En attente',
    level_faible: 'Faible',
    level_moyen: 'Moyen',
    level_fort: 'Fort',
    level_tres_fort: 'Très fort',

    // Phrase d'accompagnement sous la barre
    advice_empty: 'Saisissez un mot de passe pour lancer l’analyse.',
    advice_faible: 'Trop court ou trop simple : à remplacer sans attendre.',
    advice_moyen: 'Acceptable, mais encore loin d’être sûr.',
    advice_fort: 'Bon mot de passe. Un dernier effort pour le maximum.',
    advice_tres_fort: 'Excellent. Ce mot de passe tient la route.',

    // Champ de saisie
    input_label: 'Mot de passe',
    input_placeholder: 'Votre mot de passe',
    show_password: 'Afficher le mot de passe',
    hide_password: 'Masquer le mot de passe',
    clear: 'Effacer le champ',
    generate_button: 'Générer un mot de passe fort',
    copy_button: 'Copier le mot de passe',
    copied: 'Copié',
    copy_failed: 'Copie impossible',

    // Check-list des critères
    // {min} vient de CONFIG.MIN_LENGTH_CRITERION : changer le seuil dans
    // strength.js met automatiquement l'écran à jour.
    criteria_title: 'Critères du cahier des charges',
    crit_length: 'Au moins {min} caractères',
    crit_lowercase: 'Une minuscule (a-z)',
    crit_uppercase: 'Une majuscule (A-Z)',
    crit_digits: 'Un chiffre (0-9)',
    crit_special: 'Un caractère spécial (!@#…)',
    crit_ok: 'validé',
    crit_todo: 'à faire',
    // Annonce vocale rejouée à chaque frappe (aria-live).
    announce: 'Niveau : {level}, {percent} %.',

    // Bloc « Détails »
    details_title: 'Détails',
    details_open: 'Afficher les détails',
    details_close: 'Masquer les détails',
    types_count: 'Types de caractères',
    length_label: 'Longueur',
    entropy_label: 'Entropie',
    crack_time_label: 'Temps de cassage estimé',
    bonus_badge: 'bonus',
    bonus_note: 'Les lignes marquées « bonus » vont au-delà du cahier des charges.',

    // Avertissements bonus
    warn_common: 'Ce mot de passe figure parmi les plus courants.',
    warn_repetition: 'Répétitions détectées (aaaa, abcabc…).',
    warn_sequence: 'Suite détectée (1234, azerty…).',
    no_warnings: 'Aucune faiblesse évidente détectée.',

    // Conseil « niveau suivant »
    next_level_hint: 'Pour atteindre « {level} » : {needs}',
    next_need_chars: '+{n} caractère|+{n} caractères',
    next_need_types: '+{n} type de caractère|+{n} types de caractères',
    next_level_done: 'Niveau maximal atteint.',

    // Unités
    // {n} choisit la forme plurielle, {value} porte le nombre déjà formaté.
    unit_bits: '{value} bit|{value} bits',
    unit_chars: '{n} caractère|{n} caractères',
    value_over: 'plus de {n}',

    // Durées
    time_instant: 'instantané',
    time_seconds: '{n} seconde|{n} secondes',
    time_minutes: '{n} minute|{n} minutes',
    time_hours: '{n} heure|{n} heures',
    time_days: '{n} jour|{n} jours',
    time_months: '{n} mois|{n} mois',
    time_years: '{n} an|{n} ans',
    time_centuries: '{n} siècle|{n} siècles',
    time_eternity: 'des millions d’années',

    privacy_note:
      'Analyse 100 % locale — votre mot de passe ne quitte jamais votre appareil.',
  },

  /* ------------------------------- РУССКИЙ ------------------------------- */
  ru: {
    app_title: 'Надёжность пароля',
    app_subtitle: 'Анализ в реальном времени, прямо на вашем устройстве.',
    lang_label: 'Выбрать язык',

    level_empty: 'Ожидание',
    level_faible: 'Слабый',
    level_moyen: 'Средний',
    level_fort: 'Надёжный',
    level_tres_fort: 'Очень надёжный',

    advice_empty: 'Введите пароль, чтобы начать анализ.',
    advice_faible: 'Слишком короткий или простой — замените его.',
    advice_moyen: 'Приемлемо, но до безопасного ещё далеко.',
    advice_fort: 'Хороший пароль. Ещё немного до максимума.',
    advice_tres_fort: 'Отлично. Такой пароль выдержит перебор.',

    input_label: 'Пароль',
    input_placeholder: 'Ваш пароль',
    show_password: 'Показать пароль',
    hide_password: 'Скрыть пароль',
    clear: 'Очистить поле',
    generate_button: 'Сгенерировать надёжный пароль',
    copy_button: 'Скопировать пароль',
    copied: 'Скопировано',
    copy_failed: 'Не удалось скопировать',

    criteria_title: 'Критерии из техзадания',
    crit_length: 'Не менее {min} символов',
    crit_lowercase: 'Строчная буква (a-z)',
    crit_uppercase: 'Заглавная буква (A-Z)',
    crit_digits: 'Цифра (0-9)',
    crit_special: 'Спецсимвол (!@#…)',
    crit_ok: 'выполнено',
    crit_todo: 'не выполнено',
    announce: 'Уровень: {level}, {percent} %.',

    details_title: 'Подробности',
    details_open: 'Показать подробности',
    details_close: 'Скрыть подробности',
    types_count: 'Типы символов',
    length_label: 'Длина',
    entropy_label: 'Энтропия',
    crack_time_label: 'Оценка времени взлома',
    bonus_badge: 'бонус',
    bonus_note: 'Строки с пометкой «бонус» выходят за рамки задания.',

    warn_common: 'Этот пароль входит в список самых частых.',
    warn_repetition: 'Обнаружены повторы (aaaa, abcabc…).',
    warn_sequence: 'Обнаружена последовательность (1234, йцукен…).',
    no_warnings: 'Явных слабостей не обнаружено.',

    next_level_hint: 'До уровня «{level}»: {needs}',
    next_need_chars: '+{n} символ|+{n} символа|+{n} символов',
    next_need_types: '+{n} тип символов|+{n} типа символов|+{n} типов символов',
    next_level_done: 'Достигнут максимальный уровень.',

    unit_bits: '{value} бит|{value} бита|{value} бит',
    unit_chars: '{n} символ|{n} символа|{n} символов',
    value_over: 'более {n}',

    time_instant: 'мгновенно',
    time_seconds: '{n} секунда|{n} секунды|{n} секунд',
    time_minutes: '{n} минута|{n} минуты|{n} минут',
    time_hours: '{n} час|{n} часа|{n} часов',
    time_days: '{n} день|{n} дня|{n} дней',
    time_months: '{n} месяц|{n} месяца|{n} месяцев',
    time_years: '{n} год|{n} года|{n} лет',
    time_centuries: '{n} век|{n} века|{n} веков',
    time_eternity: 'миллионы лет',

    privacy_note:
      'Анализ на 100 % локальный — пароль никогда не покидает ваше устройство.',
  },

  /* ------------------------------- ENGLISH ------------------------------- */
  en: {
    app_title: 'Password strength',
    app_subtitle: 'Real-time analysis, right on your device.',
    lang_label: 'Choose language',

    level_empty: 'Waiting',
    level_faible: 'Weak',
    level_moyen: 'Medium',
    level_fort: 'Strong',
    level_tres_fort: 'Very strong',

    advice_empty: 'Type a password to start the analysis.',
    advice_faible: 'Too short or too simple — replace it now.',
    advice_moyen: 'Acceptable, but still far from safe.',
    advice_fort: 'Good password. One last push for the maximum.',
    advice_tres_fort: 'Excellent. This password holds up.',

    input_label: 'Password',
    input_placeholder: 'Your password',
    show_password: 'Show password',
    hide_password: 'Hide password',
    clear: 'Clear the field',
    generate_button: 'Generate a strong password',
    copy_button: 'Copy password',
    copied: 'Copied',
    copy_failed: 'Copy failed',

    criteria_title: 'Specification criteria',
    crit_length: 'At least {min} characters',
    crit_lowercase: 'A lowercase letter (a-z)',
    crit_uppercase: 'An uppercase letter (A-Z)',
    crit_digits: 'A digit (0-9)',
    crit_special: 'A special character (!@#…)',
    crit_ok: 'met',
    crit_todo: 'not met',
    announce: 'Level: {level}, {percent}%.',

    details_title: 'Details',
    details_open: 'Show details',
    details_close: 'Hide details',
    types_count: 'Character types',
    length_label: 'Length',
    entropy_label: 'Entropy',
    crack_time_label: 'Estimated crack time',
    bonus_badge: 'bonus',
    bonus_note: 'Rows marked “bonus” go beyond the original specification.',

    warn_common: 'This password is among the most common ones.',
    warn_repetition: 'Repetitions detected (aaaa, abcabc…).',
    warn_sequence: 'Sequence detected (1234, qwerty…).',
    no_warnings: 'No obvious weakness detected.',

    next_level_hint: 'To reach “{level}”: {needs}',
    next_need_chars: '+{n} character|+{n} characters',
    next_need_types: '+{n} character type|+{n} character types',
    next_level_done: 'Maximum level reached.',

    // {n} choisit la forme plurielle, {value} porte le nombre déjà formaté.
    unit_bits: '{value} bit|{value} bits',
    unit_chars: '{n} character|{n} characters',
    value_over: 'over {n}',

    time_instant: 'instant',
    time_seconds: '{n} second|{n} seconds',
    time_minutes: '{n} minute|{n} minutes',
    time_hours: '{n} hour|{n} hours',
    time_days: '{n} day|{n} days',
    time_months: '{n} month|{n} months',
    time_years: '{n} year|{n} years',
    time_centuries: '{n} century|{n} centuries',
    time_eternity: 'millions of years',

    privacy_note:
      '100 % local analysis — your password never leaves your device.',
  },
};

/* =============================================================================
 * 3. ÉTAT COURANT + ABONNEMENTS
 * ============================================================================= */

let currentLang = DEFAULT_LANG;
const listeners = new Set();

/** Langue active (code à 2 lettres). */
export function getLang() {
  return currentLang;
}

/** Locale complète pour `Intl` (ex. « fr-FR »). */
export function getLocale() {
  return LOCALES[currentLang] || LOCALES[DEFAULT_LANG];
}

/**
 * Change la langue active et prévient les abonnés.
 * @returns {boolean} vrai si la langue a réellement changé.
 */
export function setLang(lang) {
  const next = LANGS.includes(lang) ? lang : DEFAULT_LANG;
  if (next === currentLang) return false;
  currentLang = next;
  listeners.forEach((fn) => fn(currentLang));
  return true;
}

/** S'abonner au changement de langue. Retourne une fonction de désabonnement. */
export function onLangChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/**
 * Devine la langue à partir d'un code Telegram/navigateur (« ru-RU », « en-GB »…).
 * Tout ce qui n'est pas reconnu retombe sur le français.
 */
export function detectLang(...codes) {
  for (const code of codes) {
    if (typeof code !== 'string') continue;
    const short = code.slice(0, 2).toLowerCase();
    if (LANGS.includes(short)) return short;
  }
  return DEFAULT_LANG;
}

/* =============================================================================
 * 4. PLURIELS
 * ============================================================================= */

/**
 * Index de la forme plurielle à utiliser.
 * fr : 0 si n < 2, sinon 1.  en : 0 si n == 1, sinon 1.
 * ru : 3 formes (1 / 2-4 / 5+) avec les exceptions 11-14.
 */
export function pluralIndex(lang, n) {
  const value = Math.abs(Number(n) || 0);
  if (lang === 'ru') {
    const mod10 = value % 10;
    const mod100 = value % 100;
    if (mod10 === 1 && mod100 !== 11) return 0;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 1;
    return 2;
  }
  if (lang === 'fr') return value < 2 ? 0 : 1;
  return value === 1 ? 0 : 1;
}

/* =============================================================================
 * 5. TRADUCTION
 * ============================================================================= */

/**
 * Traduit une clé et remplace les variables {nom}.
 * Gère les formes plurielles séparées par « | » quand `vars.n` est fourni.
 *
 * @param {string} key  clé de la table STRINGS
 * @param {object} vars variables d'interpolation, dont `n` pour le pluriel
 * @returns {string}
 */
export function t(key, vars = {}) {
  const table = STRINGS[currentLang] || STRINGS[DEFAULT_LANG];
  let raw = table[key];
  if (raw === undefined) raw = STRINGS[DEFAULT_LANG][key];
  if (raw === undefined) return key; // clé inconnue : on affiche la clé, pas d'erreur

  // Sélection de la forme plurielle
  if (raw.includes('|')) {
    const forms = raw.split('|');
    const index = vars.n === undefined ? 0 : pluralIndex(currentLang, vars.n);
    raw = forms[Math.min(index, forms.length - 1)];
  }

  // Interpolation {variable}
  return raw.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  );
}

/** Nombre formaté selon la locale active (espace fine en fr, etc.). */
export function formatNumber(value, options = {}) {
  try {
    return new Intl.NumberFormat(getLocale(), options).format(value);
  } catch {
    return String(value);
  }
}

export default { STRINGS, LANGS, getLang, setLang, t };
