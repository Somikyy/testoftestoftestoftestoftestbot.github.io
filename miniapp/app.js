/**
 * =============================================================================
 *  app.js — VÉRIFICATEUR DE FORCE DE MOT DE PASSE (Telegram Mini App)
 *  Direction artistique : « Telegram natif ».
 * -----------------------------------------------------------------------------
 *  Toute la logique de notation vit dans ./strength.js — ce fichier ne fait que
 *  brancher le moteur sur l'interface.
 *
 *  RÈGLE ABSOLUE : le mot de passe ne quitte jamais la page.
 *  Aucun fetch, aucun stockage, aucun envoi vers Telegram. Seule la LANGUE
 *  choisie est mémorisée.
 * =============================================================================
 */

// CONFIG est importé pour que l'écran suive TOUJOURS les règles du moteur :
// changer MIN_LENGTH_CRITERION dans strength.js met à jour le libellé « Au moins
// N caractères » et le compteur « 12 / N » sans toucher à ce fichier.
import { analyzePassword, generateStrongPassword, COMMON_PASSWORDS, CONFIG } from './strength.js';
import { LANGS, DEFAULT_LANG, t, getLang, setLang, detectLang, onLangChange, formatNumber } from './i18n.js';

/* =============================================================================
 * 1. CONSTANTES, ÉTAT ET RÉFÉRENCES DOM
 * ========================================================================== */

/** Réglages d'interface (rien d'ici n'influence la notation du mot de passe). */
const UI_CONFIG = {
  /** Longueur du mot de passe produit par le bouton « Générer ». */
  generatedLength: 20,
  /** Durée du compteur animé de pourcentage (ms). */
  counterDuration: 320,
  /**
   * Le projet est rédigé et corrigé en FRANÇAIS : le français est donc la
   * langue affichée par défaut, quelle que soit la langue du navigateur ou
   * du compte Telegram. L'utilisateur reste libre de basculer en RU/EN avec
   * le sélecteur, et son choix est mémorisé.
   * Passer à `true` pour détecter automatiquement la langue à l'ouverture.
   * (RU: французский по умолчанию — проект сдаётся во Франции.
   *      Поставь `true`, чтобы язык определялся автоматически.)
   */
  autoDetectLanguage: false,
  /**
   * Lottie est un BONUS totalement facultatif. Tant qu'aucun fichier
   * ./lottie/<niveau>.json n'est fourni, on laisse le drapeau à `false` :
   * cela évite une requête 404 inutile. Les visages SVG maison suffisent.
   */
  lottieEnabled: false,
  lottieCdn: 'https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie_light.min.js',
};

/** Clé de stockage — LANGUE UNIQUEMENT, jamais le mot de passe. */
const LANG_STORAGE_KEY = 'pwd_checker_lang';

/** Le SDK Telegram est facultatif : hors Telegram, `tg` vaut undefined. */
const tg = window.Telegram?.WebApp;

/**
 * Sommes-nous VRAIMENT dans Telegram ?
 * Chargé dans un navigateur ordinaire, le SDK existe quand même mais annonce
 * `platform === 'unknown'` et invente un thème clair par défaut. Sans ce test,
 * ce faux thème écraserait le mode sombre du navigateur.
 */
const inTelegram = Boolean(tg && tg.platform && tg.platform !== 'unknown');

/** Préférence système « moins d'animations ». */
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/** État courant de l'interface. */
const state = {
  level: 'empty',        // niveau affiché ('empty' quand le champ est vide)
  displayedScore: 0,     // valeur affichée par le compteur animé
  counterFrame: 0,       // id du requestAnimationFrame du compteur
  hasCelebrated: false,  // confettis « Très fort » déjà joués ?
  lastResult: null,      // dernier résultat d'analyse (sans le mot de passe)
};

const dom = {
  app: document.getElementById('app'),
  langSwitch: document.getElementById('langSwitch'),
  segThumb: document.getElementById('segThumb'),
  stage: document.getElementById('sceneStage'),
  ring: document.getElementById('sceneRing'),
  lottieBox: document.getElementById('sceneLottie'),
  faces: Array.from(document.querySelectorAll('.face')),
  field: document.getElementById('field'),
  input: document.getElementById('password'),
  toggleBtn: document.getElementById('toggleBtn'),
  clearBtn: document.getElementById('clearBtn'),
  generateBtn: document.getElementById('generateBtn'),
  copyBtn: document.getElementById('copyBtn'),
  levelName: document.getElementById('levelName'),
  levelPct: document.getElementById('levelPct'),
  levelLive: document.getElementById('levelLive'),
  bar: document.getElementById('bar'),
  barFills: Array.from(document.querySelectorAll('.bar__fill')),
  crits: Array.from(document.querySelectorAll('.crit')),
  critsCount: document.getElementById('critsCount'),
  detailsToggle: document.getElementById('detailsToggle'),
  detailsPanel: document.getElementById('detailsPanel'),
  dTypes: document.getElementById('dTypes'),
  dLength: document.getElementById('dLength'),
  dEntropy: document.getElementById('dEntropy'),
  dCrack: document.getElementById('dCrack'),
  warns: document.getElementById('warns'),
  nextHint: document.getElementById('nextHint'),
  toast: document.getElementById('toast'),
  confetti: document.getElementById('confetti'),
};

/* =============================================================================
 * 2. INTÉGRATION TELEGRAM — thème, version, haptique
 * ========================================================================== */

/** Compare `tg.version` à une version minimale (« 6.9 »). */
function supportsVersion(minVersion) {
  if (!tg?.version) return false;
  const current = String(tg.version).split('.').map(Number);
  const wanted = String(minVersion).split('.').map(Number);
  for (let i = 0; i < wanted.length; i++) {
    const a = current[i] || 0;
    const b = wanted[i] || 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return true;
}

/** Luminance relative approximative d'une couleur hexadécimale (0 = noir). */
function hexLuminance(hex) {
  const clean = String(hex || '').replace('#', '');
  if (clean.length !== 6) return null;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Recopie `tg.themeParams` dans les variables CSS --tg-theme-*.
 * En mode navigateur, rien n'est écrit : les valeurs de repli du CSS servent.
 */
function applyTelegramTheme() {
  // Hors Telegram : on ne touche à rien, le CSS suit prefers-color-scheme.
  if (!inTelegram) return;
  const params = tg?.themeParams;
  if (!params) return;

  const mapping = {
    bg_color: '--tg-theme-bg-color',
    text_color: '--tg-theme-text-color',
    hint_color: '--tg-theme-hint-color',
    link_color: '--tg-theme-link-color',
    button_color: '--tg-theme-button-color',
    button_text_color: '--tg-theme-button-text-color',
    secondary_bg_color: '--tg-theme-secondary-bg-color',
  };

  for (const [key, cssVar] of Object.entries(mapping)) {
    if (params[key]) document.documentElement.style.setProperty(cssVar, params[key]);
  }

  // Le thème Telegram peut être clair alors que le système est sombre :
  // on décide de la palette d'après la luminosité réelle du fond.
  const luminance = hexLuminance(params.bg_color);
  if (luminance !== null) {
    document.documentElement.dataset.scheme = luminance < 0.5 ? 'dark' : 'light';
  } else if (tg.colorScheme) {
    document.documentElement.dataset.scheme = tg.colorScheme;
  }

  // Couleurs de la barre d'en-tête / du fond natif (API 6.1+).
  try {
    if (supportsVersion('6.1')) {
      if (params.secondary_bg_color) tg.setBackgroundColor(params.secondary_bg_color);
      if (params.secondary_bg_color) tg.setHeaderColor(params.secondary_bg_color);
    }
  } catch { /* option cosmétique : on ignore silencieusement */ }
}

/** Retour haptique — toujours protégé, indisponible hors Telegram. */
function haptic(kind) {
  try {
    if (!inTelegram) return;
    const feedback = tg?.HapticFeedback;
    if (!feedback || !supportsVersion('6.1')) return;
    if (kind === 'success') feedback.notificationOccurred('success');
    else if (kind === 'medium') feedback.impactOccurred('medium');
    else feedback.impactOccurred('light');
  } catch { /* jamais bloquant */ }
}

/* =============================================================================
 * 3. LANGUE — application des traductions et mémorisation
 * ========================================================================== */

/** Applique les chaînes traduites à tous les éléments marqués data-i18n*. */
function applyTranslations() {
  document.documentElement.lang = getLang();

  // Variables disponibles pour TOUTES les chaînes de l'écran. `t()` ignore
  // celles qu'une chaîne n'utilise pas, donc on peut les passer partout.
  const vars = { min: CONFIG.MIN_LENGTH_CRITERION };

  document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n, vars);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    element.setAttribute('placeholder', t(element.dataset.i18nPlaceholder));
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach((element) => {
    element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel));
  });

  // Le bouton principal de Telegram porte lui aussi une chaîne traduite.
  syncMainButton();
}

/** Déplace la pastille du sélecteur et met à jour les états ARIA. */
function highlightLang(lang) {
  const index = Math.max(0, LANGS.indexOf(lang));
  dom.segThumb.style.transform = `translateX(${index * 100}%)`;
  dom.langSwitch.querySelectorAll('.seg__btn').forEach((button) => {
    const active = button.dataset.lang === lang;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

/** Mémorise la langue : CloudStorage si disponible, sinon localStorage. */
function persistLang(lang) {
  try {
    if (inTelegram && tg.CloudStorage && supportsVersion('6.9')) {
      tg.CloudStorage.setItem(LANG_STORAGE_KEY, lang, () => {});
      return;
    }
  } catch { /* on bascule sur le repli */ }
  try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch { /* mode privé */ }
}

/** Relit la langue mémorisée (asynchrone côté CloudStorage). */
function restoreLang(callback) {
  // 1) Repli local, immédiat.
  let stored = null;
  try { stored = localStorage.getItem(LANG_STORAGE_KEY); } catch { /* mode privé */ }
  if (stored && LANGS.includes(stored)) callback(stored);

  // 2) CloudStorage : la préférence suit l'utilisateur d'un appareil à l'autre.
  try {
    if (inTelegram && tg.CloudStorage && supportsVersion('6.9')) {
      tg.CloudStorage.getItem(LANG_STORAGE_KEY, (error, value) => {
        if (!error && value && LANGS.includes(value)) callback(value);
      });
    }
  } catch { /* indisponible : on garde le repli */ }
}

/** Change de langue, redessine tout et mémorise le choix. */
function changeLang(lang) {
  if (!setLang(lang)) { highlightLang(getLang()); return; }
  persistLang(getLang());
}

/* =============================================================================
 * 4. SCÈNE EMOJI — machine à états des 5 visages
 * ========================================================================== */

/**
 * Affiche le visage correspondant au niveau.
 * La transition est un fondu court suivi d'un « pop » élastique (jamais de saut).
 */
function setFace(faceId) {
  if (state.level === faceId) return;
  state.level = faceId;

  dom.faces.forEach((face) => {
    face.classList.toggle('is-active', face.dataset.face === faceId);
  });

  // Anneau qui se propage : on relance l'animation en la retirant d'abord.
  if (!reducedMotion.matches) {
    dom.ring.classList.remove('is-pop');
    void dom.ring.offsetWidth; // force la réinitialisation de l'animation
    dom.ring.classList.add('is-pop');
  }

  // La couleur d'accent de toute la page suit le niveau.
  dom.app.dataset.level = faceId;

  maybeLoadLottie(faceId);
}

/* =============================================================================
 * 5. BARRE DE FORCE ET COMPTEUR ANIMÉ
 * ========================================================================== */

/** Remplit les 4 segments : chaque segment couvre 25 points de score. */
function renderBar(score, level) {
  dom.barFills.forEach((fill, index) => {
    const ratio = Math.min(1, Math.max(0, (score - index * 25) / 25));
    fill.style.width = `${ratio * 100}%`;
  });
  dom.bar.classList.toggle('is-max', level === 'tres_fort' && !reducedMotion.matches);
  dom.bar.setAttribute('aria-valuenow', String(score));
}

/** Compteur de pourcentage qui monte/descend en douceur (easing out). */
function animateCounter(target) {
  cancelAnimationFrame(state.counterFrame);

  const from = state.displayedScore;
  const delta = target - from;
  if (delta === 0) return;

  // Mouvement réduit, ou onglet caché (requestAnimationFrame y est gelé et le
  // chiffre resterait figé) : on écrit la valeur finale tout de suite.
  if (reducedMotion.matches || document.hidden) {
    state.displayedScore = target;
    dom.levelPct.textContent = `${target} %`;
    return;
  }

  const start = performance.now();
  const step = (now) => {
    const progress = Math.min(1, (now - start) / UI_CONFIG.counterDuration);
    const eased = 1 - Math.pow(1 - progress, 3); // easing out cubique
    const value = Math.round(from + delta * eased);
    state.displayedScore = value;
    dom.levelPct.textContent = `${value} %`;
    if (progress < 1) state.counterFrame = requestAnimationFrame(step);
  };
  state.counterFrame = requestAnimationFrame(step);
}

/* =============================================================================
 * 6. CHECK-LIST DES CRITÈRES
 * ========================================================================== */

/**
 * Coche/décoche les 5 critères du cahier des charges.
 * Le critère « length » affiche en plus « 12 / 8 ».
 */
function renderCriteria(result) {
  let validated = 0;

  result.criteria.forEach((criterion) => {
    const row = dom.crits.find((item) => item.dataset.crit === criterion.id);
    if (!row) return;

    if (criterion.ok) validated += 1;

    const wasOk = row.classList.contains('is-ok');
    row.classList.toggle('is-ok', criterion.ok);

    // Petite illumination de la ligne au moment où le critère devient valide.
    if (criterion.ok && !wasOk && !reducedMotion.matches) {
      row.classList.add('is-lit');
      setTimeout(() => row.classList.remove('is-lit'), 620);
    }

    // Le seuil vient du moteur, jamais d'une valeur écrite en dur.
    const valueSlot = row.querySelector('[data-crit-value]');
    if (valueSlot) {
      valueSlot.textContent = `${criterion.value ?? 0} / ${CONFIG.MIN_LENGTH_CRITERION}`;
    }

    // Statut réservé aux lecteurs d'écran : la coche seule ne se lit pas.
    const statusSlot = row.querySelector('[data-crit-status]');
    if (statusSlot) statusSlot.textContent = t(criterion.ok ? 'crit_ok' : 'crit_todo');
  });

  // Pastille « 3 / 5 » à côté du titre de la section.
  if (dom.critsCount) {
    dom.critsCount.textContent = `${validated} / ${result.criteria.length}`;
    dom.critsCount.classList.toggle('is-full', validated === result.criteria.length);
  }
}

/* =============================================================================
 * 7. BLOC DÉTAILS — formatage des valeurs bonus
 * ========================================================================== */

/** Traduit un nombre de secondes en durée lisible et localisée. */
function formatCrackTime(seconds) {
  // 2^1024 dépasse la capacité d'un nombre flottant : le moteur renvoie Infinity.
  if (!Number.isFinite(seconds)) return t('time_eternity');
  if (seconds < 1) return t('time_instant');

  const scale = [
    { key: 'time_seconds', size: 1 },
    { key: 'time_minutes', size: 60 },
    { key: 'time_hours', size: 3600 },
    { key: 'time_days', size: 86400 },
    { key: 'time_months', size: 2629800 },      // mois moyen
    { key: 'time_years', size: 31557600 },      // année julienne
    { key: 'time_centuries', size: 3155760000 },
  ];

  let chosen = scale[0];
  for (const unit of scale) if (seconds >= unit.size) chosen = unit;

  const amount = Math.floor(seconds / chosen.size);
  // Au-delà du million de siècles, un chiffre exact n'a plus aucun sens.
  if (chosen.key === 'time_centuries' && amount > 1e6) return t('time_eternity');

  return t(chosen.key, { n: amount });
}

/** Remplit le bloc repliable (types, longueur, entropie, temps, alertes, conseil). */
function renderDetails(result) {
  dom.dTypes.textContent = `${result.typesCount} / 4`;
  dom.dLength.textContent = formatNumber(result.length);

  if (result.isEmpty) {
    dom.dEntropy.textContent = '—';
    dom.dCrack.textContent = '—';
  } else {
    // L'entropie est arrondie à l'entier : la décimale du moteur n'apporte rien
    // à l'écran, et l'entier choisit correctement la forme plurielle.
    // Le nombre est formaté AVANT d'entrer dans t() : `n` sert au pluriel,
    // `value` porte le texte affiché (espace fine des milliers en français).
    const bits = Math.round(result.bonus.entropyBits);
    dom.dEntropy.textContent = t('unit_bits', { n: bits, value: formatNumber(bits) });
    dom.dCrack.textContent = formatCrackTime(result.bonus.crackTimeSeconds);
  }

  renderWarnings(result);
  renderNextHint(result);
}

/**
 * Alertes bonus. Construction en DOM pur (createElement + textContent) :
 * aucune chaîne venant de l'utilisateur ne passe jamais par innerHTML.
 */
function renderWarnings(result) {
  dom.warns.textContent = '';
  if (result.isEmpty) return;

  const warnings = [];
  if (result.bonus.isCommon) warnings.push({ key: 'warn_common', danger: true });
  if (result.bonus.hasRepetition) warnings.push({ key: 'warn_repetition', danger: false });
  if (result.bonus.hasSequence) warnings.push({ key: 'warn_sequence', danger: false });

  // Aucune alerte : on l'affirme, plutôt que de laisser un vide ambigu.
  if (warnings.length === 0) {
    const row = document.createElement('p');
    row.className = 'warn warn--ok';

    const text = document.createElement('span');
    text.textContent = t('no_warnings');
    row.appendChild(text);

    const badge = document.createElement('span');
    badge.className = 'badge warn__badge';
    badge.textContent = t('bonus_badge');
    row.appendChild(badge);

    dom.warns.appendChild(row);
    return;
  }

  for (const warning of warnings) {
    const row = document.createElement('p');
    row.className = warning.danger ? 'warn warn--danger' : 'warn';

    const text = document.createElement('span');
    text.textContent = t(warning.key);
    row.appendChild(text);

    const badge = document.createElement('span');
    badge.className = 'badge warn__badge';
    badge.textContent = t('bonus_badge');
    row.appendChild(badge);

    dom.warns.appendChild(row);
  }
}

/** Conseil « pour passer au niveau suivant : +N caractères, +M types ». */
function renderNextHint(result) {
  if (result.isEmpty) {
    dom.nextHint.textContent = t('advice_empty');
    return;
  }
  if (!result.nextLevel) {
    dom.nextHint.textContent = t('next_level_done');
    return;
  }

  const needs = [];
  if (result.nextLevel.missingLength > 0) {
    needs.push(t('next_need_chars', { n: result.nextLevel.missingLength }));
  }
  if (result.nextLevel.missingTypes > 0) {
    needs.push(t('next_need_types', { n: result.nextLevel.missingTypes }));
  }
  if (needs.length === 0) needs.push(t('next_need_chars', { n: 1 }));

  dom.nextHint.textContent = t('next_level_hint', {
    level: t(`level_${result.nextLevel.id}`),
    needs: needs.join(' · '),
  });
}

/* =============================================================================
 * 8. CONFETTIS — éclat de particules à la 1re atteinte de « Très fort »
 * ========================================================================== */

const confettiState = { particles: [], frame: 0, context: null };

/** Ajuste le canvas à la fenêtre en tenant compte de la densité d'écran. */
function sizeConfettiCanvas() {
  const canvas = dom.confetti;
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * ratio);
  canvas.height = Math.floor(window.innerHeight * ratio);
  confettiState.context = canvas.getContext('2d');
  confettiState.context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

/** Arrête net les confettis et efface le canvas. */
function stopConfetti() {
  cancelAnimationFrame(confettiState.frame);
  confettiState.particles.length = 0;
  confettiState.context?.clearRect(0, 0, window.innerWidth, window.innerHeight);
}

function launchConfetti() {
  // Onglet caché : requestAnimationFrame est gelé et les particules resteraient
  // figées à l'écran au retour. On ne lance rien.
  if (reducedMotion.matches || document.hidden) return;
  sizeConfettiCanvas();

  const colors = ['#a855f7', '#3b82f6', '#30d158', '#ffd43b', '#ff9f0a', '#ffffff'];
  const originX = window.innerWidth / 2;
  const originY = Math.min(190, window.innerHeight * 0.28);

  for (let i = 0; i < 90; i++) {
    const angle = (Math.PI * 2 * i) / 90 + Math.random() * 0.3;
    const speed = 3 + Math.random() * 6;
    confettiState.particles.push({
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 3,
      size: 4 + Math.random() * 5,
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.28,
      color: colors[i % colors.length],
      life: 1,
    });
  }

  cancelAnimationFrame(confettiState.frame);
  confettiState.frame = requestAnimationFrame(drawConfetti);
}

function drawConfetti() {
  const context = confettiState.context;
  if (!context) return;

  context.clearRect(0, 0, window.innerWidth, window.innerHeight);

  confettiState.particles = confettiState.particles.filter((particle) => {
    particle.vy += 0.16;          // gravité
    particle.vx *= 0.99;          // frottement de l'air
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.rotation += particle.spin;
    particle.life -= 0.009;

    if (particle.life <= 0 || particle.y > window.innerHeight + 40) return false;

    context.save();
    context.globalAlpha = Math.max(0, particle.life);
    context.translate(particle.x, particle.y);
    context.rotate(particle.rotation);
    context.fillStyle = particle.color;
    context.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * 0.62);
    context.restore();
    return true;
  });

  if (confettiState.particles.length > 0) {
    confettiState.frame = requestAnimationFrame(drawConfetti);
  } else {
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }
}

/* =============================================================================
 * 9. RENDU PRINCIPAL — appelé à chaque frappe
 * ========================================================================== */

/** Analyse la valeur du champ et met toute l'interface à jour. */
function analyzeAndRender() {
  // Le mot de passe est lu ici et nulle part ailleurs : il reste en mémoire.
  const result = analyzePassword(dom.input.value, COMMON_PASSWORDS);
  state.lastResult = result;

  const faceId = result.isEmpty ? 'empty' : result.level;
  const levelChanged = faceId !== state.level;

  setFace(faceId);
  renderBar(result.score, result.level);
  animateCounter(result.isEmpty ? 0 : result.score);
  renderCriteria(result);
  renderDetails(result);

  // Étiquette + annonce accessible.
  // L'annonce inclut le POURCENTAGE : sans lui, le texte resterait identique
  // tant que le niveau ne change pas et le lecteur d'écran ne dirait plus rien.
  const levelText = result.isEmpty ? t('level_empty') : t(`level_${result.level}`);
  dom.levelName.textContent = levelText;
  dom.levelLive.textContent = result.isEmpty
    ? t('advice_empty')
    : `${t('announce', { level: levelText, percent: result.score })} ${t(`advice_${result.level}`)}`;

  // Bordure colorée du champ + bouton « effacer »
  dom.field.classList.toggle('is-filled', !result.isEmpty);
  dom.clearBtn.hidden = result.isEmpty;

  // Retours haptiques : léger à chaque changement, succès au sommet.
  if (levelChanged && !result.isEmpty) {
    if (result.level === 'tres_fort') haptic('success');
    else haptic('light');
  }

  // Confettis à la toute première atteinte de « Très fort ».
  if (result.level === 'tres_fort' && !state.hasCelebrated) {
    state.hasCelebrated = true;
    launchConfetti();
  }
}

/* =============================================================================
 * 10. ACTIONS DE L'UTILISATEUR
 * ========================================================================== */

/** Œil : bascule entre `password` et `text`. */
function togglePasswordVisibility() {
  const shown = dom.input.type === 'text';
  dom.input.type = shown ? 'password' : 'text';
  dom.toggleBtn.setAttribute('aria-pressed', shown ? 'false' : 'true');
  dom.toggleBtn.dataset.i18nAriaLabel = shown ? 'show_password' : 'hide_password';
  dom.toggleBtn.setAttribute('aria-label', t(dom.toggleBtn.dataset.i18nAriaLabel));
  haptic('light');
}

/** Dé / MainButton : génère un mot de passe garanti « Très fort ». */
function handleGenerate() {
  dom.input.value = generateStrongPassword(UI_CONFIG.generatedLength);
  dom.input.type = 'text';                       // on montre le résultat
  dom.toggleBtn.setAttribute('aria-pressed', 'true');
  dom.toggleBtn.dataset.i18nAriaLabel = 'hide_password';
  dom.toggleBtn.setAttribute('aria-label', t('hide_password'));
  haptic('medium');
  analyzeAndRender();
}

/** Copie le mot de passe dans le presse-papiers (aucune sortie réseau). */
async function handleCopy() {
  const value = dom.input.value;
  if (!value) return;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      // Repli pour les WebViews anciennes : sélection puis copie.
      dom.input.select();
      document.execCommand('copy');
      dom.input.setSelectionRange(value.length, value.length);
    }
    showToast(t('copied'));
    haptic('success');
  } catch {
    showToast(t('copy_failed'));
  }
}

/** Croix : vide le champ et redonne le focus. */
function handleClear() {
  dom.input.value = '';
  dom.input.focus();
  haptic('light');
  analyzeAndRender();
}

/** Petit toast Telegram-like, effacé automatiquement. */
let toastTimer = 0;
function showToast(message) {
  dom.toast.textContent = message;
  dom.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dom.toast.classList.remove('is-visible'), 1800);
}

/** Bloc « Détails » : ouverture/fermeture accessible. */
function toggleDetails() {
  const open = dom.detailsToggle.getAttribute('aria-expanded') === 'true';
  dom.detailsToggle.setAttribute('aria-expanded', open ? 'false' : 'true');
  dom.detailsPanel.classList.toggle('is-open', !open);
  // Le contenu replié est retiré de l'ordre de tabulation.
  if (open) dom.detailsPanel.setAttribute('inert', '');
  else dom.detailsPanel.removeAttribute('inert');
  haptic('light');
}

/* =============================================================================
 * 11. BOUTON PRINCIPAL TELEGRAM
 * ========================================================================== */

/** Met le MainButton au bon texte / à la bonne couleur, et l'affiche. */
function syncMainButton() {
  if (!inTelegram) return;
  const button = tg?.MainButton;
  if (!button) return;
  try {
    button.setText(t('generate_button'));
    if (tg.themeParams?.button_color) {
      button.setParams({
        color: tg.themeParams.button_color,
        text_color: tg.themeParams.button_text_color || '#ffffff',
      });
    }
    button.show();
    // Le MainButton de Telegram fait déjà le travail : on retire la ligne
    // « Générer » de la carte pour ne pas proposer deux fois la même action.
    if (dom.generateBtn) dom.generateBtn.hidden = true;
  } catch {
    // MainButton indisponible : la ligne de la carte reprend son rôle.
    if (dom.generateBtn) dom.generateBtn.hidden = false;
  }
}

/* =============================================================================
 * 12. LOTTIE (BONUS FACULTATIF)
 * ========================================================================== */

let lottiePlayer = null;
let lottieLibrary = null;

/**
 * Si — et seulement si — un fichier ./lottie/<niveau>.json est fourni, on charge
 * la bibliothèque Lottie et on joue l'animation à la place du SVG maison.
 * Le moindre échec est avalé : on reste sur les visages SVG.
 */
async function maybeLoadLottie(levelId) {
  if (!UI_CONFIG.lottieEnabled) return;
  if (!location.protocol.startsWith('http')) return; // pas de fetch en file://

  try {
    const response = await fetch(`./lottie/${levelId}.json`, { cache: 'force-cache' });
    if (!response.ok) return;
    const animationData = await response.json();

    if (!lottieLibrary) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = UI_CONFIG.lottieCdn;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
      lottieLibrary = window.lottie || null;
    }
    if (!lottieLibrary) return;

    lottiePlayer?.destroy();
    dom.lottieBox.hidden = false;
    dom.stage.style.visibility = 'hidden';
    lottiePlayer = lottieLibrary.loadAnimation({
      container: dom.lottieBox,
      renderer: 'svg',
      loop: true,
      autoplay: !reducedMotion.matches,
      animationData,
    });
  } catch {
    // Repli silencieux : les emoji SVG animés maison restent affichés.
    dom.lottieBox.hidden = true;
    dom.stage.style.visibility = 'visible';
  }
}

/* =============================================================================
 * 13. BRANCHEMENT DES ÉVÉNEMENTS
 * ========================================================================== */

function bindEvents() {
  // Analyse EN TEMPS RÉEL — exigence n°1 du cahier des charges.
  dom.input.addEventListener('input', analyzeAndRender);

  dom.input.addEventListener('focus', () => dom.field.classList.add('is-focused'));
  dom.input.addEventListener('blur', () => dom.field.classList.remove('is-focused'));

  dom.toggleBtn.addEventListener('click', togglePasswordVisibility);
  dom.clearBtn.addEventListener('click', handleClear);
  dom.generateBtn.addEventListener('click', handleGenerate);
  dom.copyBtn.addEventListener('click', handleCopy);
  dom.detailsToggle.addEventListener('click', toggleDetails);

  // Sélecteur de langue (délégation d'événement).
  dom.langSwitch.addEventListener('click', (event) => {
    const button = event.target.closest('.seg__btn');
    if (!button) return;
    changeLang(button.dataset.lang);
    haptic('light');
  });

  // Retraduction complète à chaque changement de langue.
  onLangChange((lang) => {
    highlightLang(lang);
    applyTranslations();
    analyzeAndRender();
  });

  // Le thème Telegram peut changer pendant l'utilisation.
  try { if (inTelegram) tg.onEvent('themeChanged', applyTelegramTheme); } catch { /* ignoré */ }

  // Le MainButton déclenche la même action que la ligne « Générer ».
  try { if (inTelegram) tg.MainButton.onClick(handleGenerate); } catch { /* ignoré */ }

  // Confettis : le canvas suit la taille de la fenêtre.
  window.addEventListener('resize', () => {
    if (confettiState.particles.length > 0) sizeConfettiCanvas();
  });

  // Si l'utilisateur quitte l'onglet pendant l'éclat, on nettoie le canvas.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopConfetti();
  });

  // Si l'utilisateur active « mouvement réduit » en cours de route.
  reducedMotion.addEventListener?.('change', () => {
    dom.bar.classList.toggle('is-max',
      state.level === 'tres_fort' && !reducedMotion.matches);
  });
}

/* =============================================================================
 * 14. INITIALISATION
 * ========================================================================== */

function init() {
  // --- Telegram : signaler que l'app est prête, puis occuper tout l'écran ---
  try {
    if (inTelegram) {
      tg.ready();
      tg.expand();
    }
  } catch { /* hors Telegram : sans effet */ }

  applyTelegramTheme();

  // Le panneau « Détails » démarre replié : on le sort de la tabulation.
  dom.detailsPanel.setAttribute('inert', '');

  // Les écouteurs d'abord : ainsi tout changement de langue déclenché plus bas
  // repasse par onLangChange et redessine l'écran entier.
  bindEvents();

  // --- Langue : préférence mémorisée > (détection facultative) > français ---
  const suggested = UI_CONFIG.autoDetectLanguage
    ? detectLang(tg?.initDataUnsafe?.user?.language_code, navigator.language)
    : DEFAULT_LANG;
  setLang(suggested);

  highlightLang(getLang());
  applyTranslations();
  analyzeAndRender();

  // La préférence enregistrée arrive en dernier (CloudStorage est asynchrone).
  restoreLang((lang) => { setLang(lang); });
}

init();
