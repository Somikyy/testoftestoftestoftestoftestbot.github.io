/**
 * =============================================================================
 *  bot.js — BOT TELEGRAM « Vérificateur de force de mot de passe »
 *  Телеграм-бот проверки надёжности пароля
 * =============================================================================
 *
 *  PROJET ÉTUDIANT — objectif pédagogique :
 *  montrer qu'on peut écrire un bot Telegram complet SANS AUCUNE dépendance npm.
 *
 *  ┌───────────────────────────────────────────────────────────────────────┐
 *  │  ZÉRO DÉPENDANCE. On ne fait JAMAIS « npm install ».                  │
 *  │  On lance simplement :   node bot.js                                   │
 *  │                                                                       │
 *  │  Comment ? Node 25 fournit déjà tout ce dont on a besoin :            │
 *  │    • fetch()  — client HTTP intégré (plus besoin d'axios/node-fetch)  │
 *  │    • fs, path, url — lecture du fichier .env                          │
 *  │    • crypto   — utilisé par le générateur de mots de passe            │
 *  │                                                                       │
 *  │  On parle donc DIRECTEMENT à la Bot API HTTP de Telegram :            │
 *  │    https://api.telegram.org/bot<TOKEN>/<METHODE>                       │
 *  │  en « long polling » (getUpdates), c'est-à-dire que le bot demande    │
 *  │  lui-même les nouveaux messages au serveur. Pas de webhook, donc      │
 *  │  pas besoin de serveur public ni de HTTPS pour le bot lui-même.       │
 *  └───────────────────────────────────────────────────────────────────────┘
 *
 *  Le moteur de règles est PARTAGÉ avec la Mini App : ../miniapp/strength.js
 *  Une seule source de vérité => le bot et l'application affichent toujours
 *  exactement le même résultat. / Единый источник правды для бота и Mini App.
 *
 *  SOMMAIRE / СОДЕРЖАНИЕ
 *    1. Mini-parseur .env (fait maison, ~15 lignes, pas de dotenv)
 *    2. Configuration et vérifications de démarrage
 *    3. Petits outils : échappement HTML, formatage
 *    4. Couche réseau : appels à la Bot API
 *    5. Textes des messages (français)
 *    6. Rendu de l'analyse d'un mot de passe
 *    7. Traitement des commandes et des messages
 *    8. Boucle de long polling
 *    9. Arrêt propre (SIGINT / SIGTERM)
 * =============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  analyzePassword,
  generateStrongPassword,
  activeTypeIds,
  CONFIG,
  COMMON_PASSWORDS,
} from '../miniapp/strength.js';

// Dossier de CE fichier (les modules ES n'ont pas __dirname, on le recrée).
// Папка этого файла (в ES-модулях нет __dirname, воссоздаём вручную).
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* =============================================================================
 * 1. MINI-PARSEUR .env — remplace la dépendance « dotenv »
 *    Мини-парсер .env — вместо зависимости dotenv
 * ============================================================================= */

/**
 * Lit un fichier .env très simple et renvoie un objet { CLE: 'valeur' }.
 * Gère : les lignes vides, les commentaires « # », les guillemets autour
 * de la valeur, et les espaces superflus. C'est volontairement minimal :
 * pas de variables multi-lignes, pas d'interpolation.
 *
 * @param {string} filePath chemin du fichier .env
 * @returns {Record<string,string>}
 */
function parseEnvFile(filePath) {
  const result = {};
  if (!fs.existsSync(filePath)) return result;             // pas de .env => tant pis
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;           // ligne vide ou commentaire
    const eq = line.indexOf('=');
    if (eq === -1) continue;                               // ligne sans « = » : ignorée
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    let value = line.slice(eq + 1).trim();
    // On retire les guillemets simples ou doubles éventuels autour de la valeur.
    if (value.length >= 2 && /^["'].*["']$/s.test(value) && value[0] === value.at(-1)) {
      value = value.slice(1, -1);
    }
    if (key) result[key] = value;
  }
  return result;
}

/* =============================================================================
 * 2. CONFIGURATION ET VÉRIFICATIONS DE DÉMARRAGE
 *    Конфигурация и проверки при запуске
 * ============================================================================= */

// Priorité : les vraies variables d'environnement l'emportent sur le fichier .env.
// Приоритет: настоящие переменные окружения важнее файла .env.
const fileEnv = parseEnvFile(path.join(__dirname, '.env'));
const env = { ...fileEnv, ...process.env };

const BOT_TOKEN  = (env.BOT_TOKEN  || '').trim();
const MINIAPP_URL = (env.MINIAPP_URL || '').trim();

// --- Le token est OBLIGATOIRE : sans lui, rien n'est possible ----------------
if (!BOT_TOKEN) {
  console.error(`
╔══════════════════════════════════════════════════════════════════════════╗
║  ERREUR : la variable BOT_TOKEN est absente.                             ║
╚══════════════════════════════════════════════════════════════════════════╝

Le bot ne peut pas démarrer sans le jeton (token) fourni par Telegram.

COMMENT OBTENIR UN TOKEN (2 minutes) :
  1. Dans Telegram, ouvrez une discussion avec @BotFather
  2. Envoyez la commande  /newbot
  3. Choisissez un nom, puis un nom d'utilisateur se terminant par « bot »
  4. BotFather répond avec un token de la forme :
         123456789:AAF...votre-token...xyz

ENSUITE, AU CHOIX :

  (A) Créez un fichier .env à côté de bot.js
      (copiez le modèle : cp .env.example .env) puis écrivez dedans :

          BOT_TOKEN=123456789:AAF...votre-token...xyz
          MINIAPP_URL=https://votre-nom.github.io/password-checker/

  (B) Ou passez la variable directement dans le terminal :

          BOT_TOKEN=123456789:AAF... node bot.js

Ne publiez JAMAIS ce token (ni sur GitHub, ni dans un rapport rendu) :
il donne le contrôle total du bot. Le fichier .env doit rester privé.
`);
  process.exit(1);
}

// --- La Mini App n'est PAS obligatoire, mais Telegram exige du HTTPS --------
// Telegram refuse d'ouvrir une Mini App servie en http:// ou en local.
// Telegram открывает Mini App только по https.
const MINIAPP_OK = /^https:\/\/\S+$/i.test(MINIAPP_URL);

const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

/**
 * IDs de stickers animés (optionnel, vide par défaut).
 *
 * ─── NOTE HONNÊTE SUR LES « EMOJI ANIMÉS » ────────────────────────────────
 * Il faut distinguer TROIS choses souvent confondues :
 *
 *  1) EMOJI PERSONNALISÉS PREMIUM (custom_emoji_id, les petits emoji animés
 *     dans le texte). Un bot ne peut les ENVOYER que s'il possède un nom
 *     d'utilisateur ACHETÉ sur Fragment (fragment.com). C'est une contrainte
 *     réelle de Telegram, payante, et donc hors de portée d'un projet
 *     étudiant. Sans cela, l'API renvoie une erreur et le message n'est pas
 *     envoyé. => Nous n'utilisons PAS d'emoji personnalisés dans ce bot.
 *
 *  2) STICKERS ANIMÉS (.tgs). N'IMPORTE QUEL bot peut en envoyer
 *     gratuitement, avec sendSticker et un file_id. C'est la solution
 *     retenue ici : voir sendSticker() plus bas et le script fetch-emoji.mjs.
 *
 *  3) ANIMATIONS DANS LA MINI APP. Là, aucune limite : la page web peut
 *     afficher n'importe quelle animation Lottie (.json), GIF ou CSS.
 *     C'est pourquoi fetch-emoji.mjs convertit les .tgs en JSON Lottie
 *     dans miniapp/lottie/.
 *
 * Pour remplir ce tableau : envoyez un sticker au bot, puis lisez
 * message.sticker.file_id dans les logs (ou utilisez fetch-emoji.mjs).
 * ──────────────────────────────────────────────────────────────────────────
 */
const STICKER_IDS = {
  // faible:    'CAACAgIAAxkBAA...',   // exemple, à remplacer par un vrai file_id
  // moyen:     '',
  // fort:      '',
  // tres_fort: '',
};

/* =============================================================================
 * 3. PETITS OUTILS : ÉCHAPPEMENT HTML, FORMATAGE
 *    Утилиты: экранирование HTML, форматирование
 * ============================================================================= */

/**
 * Échappe les caractères réservés du parse_mode « HTML » de Telegram.
 *
 * TRÈS IMPORTANT : tout ce qui vient de l'utilisateur (nom, mot de passe,
 * texte libre) doit passer par ici. Sinon un texte comme « <b>hack » casse
 * le message, et l'API renvoie l'erreur « can't parse entities ».
 * Telegram ne demande d'échapper que & < > .
 *
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Étiquettes lisibles des 4 niveaux. / Читаемые названия 4 уровней. */
const LEVEL_LABELS = {
  faible:    { emoji: '🔴', nom: 'Faible' },
  moyen:     { emoji: '🟠', nom: 'Moyen' },
  fort:      { emoji: '🟡', nom: 'Fort' },
  tres_fort: { emoji: '🟢', nom: 'Très fort' },
};

/**
 * Libellés français des critères. / Подписи критериев.
 *
 * FR : Les critères vivent dans CONFIG.CRITERIA (voir strength.js) : le bot ne
 *      connaît QUE leurs libellés, jamais leur nombre ni leurs seuils. Activer
 *      un critère dans le moteur le fait donc apparaître ici tout seul.
 * RU : Сами критерии лежат в CONFIG.CRITERIA — бот знает только подписи.
 */
const CRITERIA_LABELS = {
  length:        'Au moins {min} caractères',
  lowercase:     'Une lettre minuscule (a-z)',
  uppercase:     'Une lettre majuscule (A-Z)',
  digits:        'Un chiffre (0-9)',
  special:       'Un caractère spécial (!@#$…)',
  no_repetition: 'Aucune répétition (aaaa, abcabc…)',
  no_sequence:   'Aucune suite (1234, azerty…)',
  not_common:    'Absent des mots de passe courants',
};

/** Libellé d'un critère, seuil courant inclus. / Подпись критерия с порогом. */
function libelleCritere(critere) {
  const modele = CRITERIA_LABELS[critere.id] || critere.id;
  return modele.replace('{min}', String(critere.min ?? CONFIG.MIN_LENGTH_CRITERION));
}

/**
 * Barre de progression en blocs pleins / vides.
 * Exemple : score 60 => « ██████░░░░ »
 * @param {number} score 0..100
 * @param {number} width nombre de blocs
 */
function progressBar(score, width = 10) {
  const filled = Math.max(0, Math.min(width, Math.round((score / 100) * width)));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/**
 * Met une durée en secondes sous forme lisible en français.
 * Sert à afficher le temps de cassage estimé (indicatif !).
 * @param {number} seconds
 */
function humanDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'instantané';
  if (seconds < 1) return 'moins d’une seconde';
  const units = [
    { s: 1,            n: 'seconde',  p: 'secondes' },
    { s: 60,           n: 'minute',   p: 'minutes' },
    { s: 3600,         n: 'heure',    p: 'heures' },
    { s: 86400,        n: 'jour',     p: 'jours' },
    { s: 2592000,      n: 'mois',     p: 'mois' },
    { s: 31536000,     n: 'an',       p: 'ans' },
    { s: 31536000e3,   n: 'millénaire', p: 'millénaires' },
  ];
  if (seconds >= 31536000e6) return 'des milliards d’années';
  let chosen = units[0];
  for (const u of units) if (seconds >= u.s) chosen = u;
  const v = seconds / chosen.s;
  const rounded = v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${rounded.toLocaleString('fr-FR')} ${rounded > 1 ? chosen.p : chosen.n}`;
}

/* =============================================================================
 * 4. COUCHE RÉSEAU : APPELS À LA BOT API
 *    Сетевой слой: вызовы Bot API
 * ============================================================================= */

/**
 * Appelle une méthode de la Bot API en HTTP POST + JSON.
 *
 * Toutes les méthodes Telegram fonctionnent pareil :
 *   POST https://api.telegram.org/bot<TOKEN>/<methode>
 *   Body JSON  ->  Réponse JSON { ok: true, result: ... }
 *                            ou { ok: false, description: "..." }
 *
 * @param {string} method  ex. 'sendMessage'
 * @param {object} payload corps de la requête
 * @param {number} timeoutMs délai maximal (le long polling a besoin de plus)
 * @returns {Promise<any>} le champ « result »
 */
async function callApi(method, payload = {}, timeoutMs = 15000) {
  // AbortController = façon standard d'annuler un fetch qui traîne.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!data.ok) {
      const err = new Error(`Telegram ${method} : ${data.description || 'erreur inconnue'}`);
      err.telegram = data;                       // on garde le détail pour le diagnostic
      throw err;
    }
    return data.result;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Envoie un message texte formaté en HTML.
 * @param {number|string} chatId
 * @param {string} html texte DÉJÀ échappé pour les parties utilisateur
 * @param {object} extra options supplémentaires (reply_markup, etc.)
 */
function sendMessage(chatId, html, extra = {}) {
  return callApi('sendMessage', {
    chat_id: chatId,
    text: html,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },  // pas d'aperçu de lien encombrant
    ...extra,
  });
}

/**
 * Envoie un sticker animé SI un identifiant est configuré dans STICKER_IDS.
 * Si rien n'est configuré (cas par défaut), la fonction ne fait rien du tout :
 * le bot reste parfaitement fonctionnel sans sticker.
 *
 * @param {number|string} chatId
 * @param {string} key clé de STICKER_IDS, ex. 'tres_fort'
 */
async function sendStickerIfConfigured(chatId, key) {
  const fileId = STICKER_IDS[key];
  if (!fileId) return;                            // aucun sticker configuré : on sort
  try {
    await callApi('sendSticker', { chat_id: chatId, sticker: fileId });
  } catch (error) {
    // Un sticker est un bonus décoratif : jamais bloquant.
    console.warn('[sticker] envoi impossible :', error.message);
  }
}

/**
 * Tente de supprimer un message. Peut échouer légitimement :
 *  - le bot n'a pas les droits (groupe sans droit « supprimer les messages »)
 *  - le message a plus de 48 heures
 * D'où le try/catch obligatoire.
 *
 * @returns {Promise<boolean>} true si la suppression a réussi
 */
async function tryDeleteMessage(chatId, messageId) {
  try {
    await callApi('deleteMessage', { chat_id: chatId, message_id: messageId });
    return true;
  } catch {
    return false;                                 // normal, on n'alerte pas l'utilisateur
  }
}

/** Petite pause. / Небольшая пауза. */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* =============================================================================
 * 5. TEXTES DES MESSAGES (français)
 *    Тексты сообщений (французский)
 * ============================================================================= */

/** Tableau des 4 niveaux, construit à partir de CONFIG (jamais recopié à la main). */
function tableauDesNiveaux() {
  const lignes = CONFIG.LEVELS
    .slice()                                      // copie : on ne modifie pas CONFIG
    .sort((a, b) => a.index - b.index)            // du plus faible au plus fort
    .map((niveau) => {
      const label = LEVEL_LABELS[niveau.id];
      const longueur = niveau.minLength > 0 ? `≥ ${niveau.minLength} caractères` : 'toute longueur';
      const types = niveau.minTypes > 0 ? `${niveau.minTypes} type(s) de caractères` : 'aucune exigence';
      return `${label.emoji} <b>${label.nom}</b>\n   └ ${longueur} · ${types}`;
    });

  return [
    '📊 <b>Les 4 niveaux de force</b>',
    '',
    'Les 4 <i>types</i> de caractères sont : minuscule, majuscule, chiffre, caractère spécial.',
    '',
    ...lignes,
    '',
    '<i>L’évaluation part du haut : le niveau le plus élevé dont toutes les conditions sont remplies l’emporte.</i>',
  ].join('\n');
}

/** Message d'accueil. / Приветствие. */
function messageAccueil(prenom) {
  const bonjour = prenom ? `Bonjour ${escapeHtml(prenom)} !` : 'Bonjour !';
  const lignes = [
    `🔐 <b>Vérificateur de force de mot de passe</b>`,
    '',
    bonjour,
    'Je mesure la solidité d’un mot de passe selon 4 niveaux : Faible, Moyen, Fort et Très fort.',
    '',
    '<b>Ce que je sais faire</b>',
    '/generer — créer un mot de passe très fort',
    '/regles — le tableau des 4 niveaux',
    '/aide — comment fonctionne l’évaluation',
    '',
    '⚠️ <b>Consigne de sécurité</b>',
    'N’envoyez jamais un <i>vrai</i> mot de passe dans une conversation Telegram : ' +
      'il resterait stocké dans l’historique du chat. Pour tester, utilisez un mot de passe ' +
      'inventé — ou, mieux, ' +
      (MINIAPP_OK
        ? 'l’application ci-dessous, qui analyse tout dans votre téléphone sans rien envoyer sur le réseau.'
        : 'une application locale, qui analyse tout sur votre appareil sans rien envoyer sur le réseau.'),
  ];

  // Le bouton « web_app » n'existe que si l'URL est valide ET en HTTPS.
  if (!MINIAPP_OK) {
    lignes.push(
      '',
      'ℹ️ <b>L’application n’est pas encore configurée.</b>',
      MINIAPP_URL
        ? `L’adresse fournie (<code>${escapeHtml(MINIAPP_URL)}</code>) n’est pas en <code>https://</code>. ` +
          'Telegram refuse d’ouvrir une Mini App sur une autre adresse.'
        : 'Ajoutez <code>MINIAPP_URL=https://…</code> dans le fichier <code>.env</code>, ' +
          'puis relancez le bot pour faire apparaître le bouton d’ouverture.',
    );
  }

  return lignes.join('\n');
}

/** Clavier inline avec le bouton Mini App (ou rien si non configurée). */
function clavierMiniApp() {
  if (!MINIAPP_OK) return undefined;
  return {
    inline_keyboard: [[{ text: "🔐 Ouvrir l'application", web_app: { url: MINIAPP_URL } }]],
  };
}

/** Message d'aide détaillé. / Подробная справка. */
function messageAide() {
  return [
    '❓ <b>Comment l’évaluation fonctionne</b>',
    '',
    'Deux mesures seulement, volontairement simples et vérifiables :',
    '',
    '<b>1. La longueur</b> — comptée en caractères Unicode ' +
      '(un emoji compte pour 1, un « é » aussi).',
    '',
    '<b>2. La variété</b> — combien de <i>types</i> de caractères différents sont présents :',
    '   • minuscules <code>a-z</code>',
    '   • majuscules <code>A-Z</code>',
    '   • chiffres <code>0-9</code>',
    '   • caractères spéciaux <code>!@#$%…</code>',
    '',
    tableauDesNiveaux(),
    '',
    '<b>Pourquoi la longueur compte plus que la complexité ?</b>',
    'Chaque caractère supplémentaire multiplie le nombre d’essais nécessaires. ' +
      'Une phrase longue et facile à retenir bat presque toujours un mot court bourré de symboles.',
    '',
    '<b>Vérifications supplémentaires</b> (hors barème, à titre d’information) :',
    `• présence dans une liste de ${COMMON_PASSWORDS.size} mots de passe très répandus`,
    '• répétitions (<code>aaaa</code>) et suites (<code>1234</code>, <code>azerty</code>)',
    '• estimation du temps de cassage',
    '',
    '<b>Confidentialité</b> — rien n’est enregistré : aucun mot de passe n’est écrit ' +
      'dans les journaux du bot, et l’analyse de la Mini App ne quitte jamais votre appareil.',
    '',
    'Commandes : /generer · /regles · /start',
  ].join('\n');
}

/* =============================================================================
 * 6. RENDU DE L'ANALYSE D'UN MOT DE PASSE
 *    Отрисовка результата анализа
 * ============================================================================= */

/**
 * Construit le message de résultat à partir de l'objet renvoyé par
 * analyzePassword(). Le mot de passe lui-même n'apparaît NULLE PART.
 *
 * @param {ReturnType<typeof analyzePassword>} resultat
 * @returns {string} HTML prêt à envoyer
 */
function rendreAnalyse(resultat) {
  const label = LEVEL_LABELS[resultat.level] || LEVEL_LABELS.faible;
  const lignes = [];

  // --- En-tête : niveau + barre de progression -------------------------------
  lignes.push(`${label.emoji} <b>Niveau : ${label.nom}</b>`);
  lignes.push(`<code>${progressBar(resultat.score)}</code> ${resultat.score}/100`);
  lignes.push('');
  lignes.push(`Longueur : <b>${resultat.length}</b> caractère${resultat.length > 1 ? 's' : ''} · ` +
              // Le dénominateur suit les types RÉELLEMENT exigés par le moteur.
              `Types utilisés : <b>${resultat.typesCount}/${activeTypeIds().length}</b>`);
  lignes.push('');

  // --- Liste des critères ----------------------------------------------------
  lignes.push('<b>Critères</b>');
  for (const critere of resultat.criteria) {
    const icone = critere.ok ? '✅' : '❌';
    lignes.push(`${icone} ${libelleCritere(critere)}`);
  }

  // --- Conseil pour atteindre le niveau suivant ------------------------------
  lignes.push('');
  if (resultat.nextLevel) {
    const cible = LEVEL_LABELS[resultat.nextLevel.id];
    const manques = [];
    if (resultat.nextLevel.missingLength > 0) {
      manques.push(`<b>${resultat.nextLevel.missingLength}</b> caractère${resultat.nextLevel.missingLength > 1 ? 's' : ''} de plus`);
    }
    if (resultat.nextLevel.missingTypes > 0) {
      manques.push(`<b>${resultat.nextLevel.missingTypes}</b> type${resultat.nextLevel.missingTypes > 1 ? 's' : ''} de caractères en plus`);
    }
    lignes.push(
      manques.length
        ? `💡 Pour passer à ${cible.emoji} <b>${cible.nom}</b> : ajoutez ${manques.join(' et ')}.`
        : `💡 Encore un petit effort pour atteindre ${cible.emoji} <b>${cible.nom}</b>.`,
    );
  } else {
    lignes.push('🏆 Niveau maximal atteint — rien à améliorer côté barème.');
  }

  // --- Remarques bonus (hors cahier des charges) -----------------------------
  const remarques = [];
  if (resultat.bonus.isCommon) {
    remarques.push('🚨 Ce mot de passe figure dans les listes publiques de mots de passe les plus utilisés : il serait cassé immédiatement.');
  }
  if (resultat.bonus.hasSequence) {
    remarques.push('↗️ Il contient une suite reconnaissable (<code>1234</code>, <code>azerty</code>…).');
  }
  if (resultat.bonus.hasRepetition) {
    remarques.push('🔁 Il contient des répétitions (<code>aaaa</code>, <code>abcabc</code>…).');
  }
  if (!resultat.isEmpty) {
    remarques.push(`⏱ Temps de cassage estimé : <b>${humanDuration(resultat.bonus.crackTimeSeconds)}</b> ` +
                   `(≈ ${resultat.bonus.entropyBits} bits d’entropie, estimation théorique).`);
  }
  if (remarques.length) {
    lignes.push('');
    lignes.push('<b>Remarques</b>');
    lignes.push(...remarques);
  }

  return lignes.join('\n');
}

/**
 * Message de sécurité envoyé APRÈS chaque analyse d'un texte libre.
 * @param {boolean} supprime le message de l'utilisateur a-t-il été effacé ?
 */
function messageSecurite(supprime) {
  const lignes = [
    '🛡 <b>Rappel de sécurité</b>',
    'Un mot de passe envoyé dans une conversation reste écrit dans l’historique ' +
      'Telegram, sur votre appareil comme sur celui du destinataire. ' +
      '<b>N’envoyez jamais un vrai mot de passe dans un chat</b>, à personne, même à un bot.',
    supprime
      ? '🧹 J’ai supprimé votre message pour ne pas le laisser traîner dans la discussion.'
      : '🧹 J’ai essayé de supprimer votre message, sans y parvenir (droits insuffisants). ' +
        'Supprimez-le vous-même : appui long sur le message → Supprimer.',
  ];
  lignes.push(
    MINIAPP_OK
      ? '✅ Pour tester vos vrais mots de passe, utilisez l’application : tout y est analysé ' +
        'directement dans votre téléphone, rien n’est envoyé sur le réseau.'
      : '✅ La bonne pratique : analyser ses mots de passe dans une application locale ' +
        '(comme la Mini App de ce projet), où rien ne transite par le réseau.',
  );
  return lignes.join('\n');
}

/* =============================================================================
 * 7. TRAITEMENT DES COMMANDES ET DES MESSAGES
 *    Обработка команд и сообщений
 * ============================================================================= */

/**
 * Traite un objet « message » de Telegram.
 * @param {object} message
 */
async function traiterMessage(message) {
  const chatId = message.chat?.id;
  if (!chatId) return;

  const texte = message.text;

  // --- Message non textuel (photo, sticker, vocal…) --------------------------
  if (typeof texte !== 'string') {
    await sendMessage(chatId, 'Je ne comprends que le texte. Envoyez /aide pour voir ce que je sais faire.');
    return;
  }

  // On isole la commande : « /aide@MonBot argument » -> « /aide »
  const commande = texte.trim().split(/\s+/)[0].split('@')[0].toLowerCase();

  switch (commande) {
    // ---------------------------------------------------------------- /start
    case '/start':
      await sendMessage(chatId, messageAccueil(message.from?.first_name), {
        reply_markup: clavierMiniApp(),
      });
      return;

    // ------------------------------------------------------------ /aide /help
    case '/aide':
    case '/help':
      await sendMessage(chatId, messageAide(), { reply_markup: clavierMiniApp() });
      return;

    // -------------------------------------------------------------- /regles
    case '/regles':
      await sendMessage(chatId, tableauDesNiveaux());
      return;

    // ------------------------------------------------------------- /generer
    case '/generer': {
      const motDePasse = generateStrongPassword(20);
      // On l'échappe : il contient des caractères spéciaux, dont < et >.
      await sendMessage(chatId, [
        '🎲 <b>Mot de passe généré</b>',
        '',
        `<code>${escapeHtml(motDePasse)}</code>`,
        '<i>(appuyez dessus pour le copier)</i>',
        '',
        '20 caractères, les 4 types présents → niveau 🟢 <b>Très fort</b>.',
        '',
        '⚠️ Ce mot de passe vient d’apparaître dans une conversation : il n’est donc ' +
        '<b>plus secret</b>. Considérez-le comme une démonstration. ' +
        'Pour un usage réel, générez-le dans l’application ou dans un gestionnaire ' +
        'de mots de passe, et ne le faites jamais transiter par un chat.',
      ].join('\n'), { reply_markup: clavierMiniApp() });
      await sendStickerIfConfigured(chatId, 'tres_fort');
      return;
    }

    // ------------------------------------------- commande inconnue (/xxx)
    default:
      if (commande.startsWith('/')) {
        await sendMessage(chatId, 'Commande inconnue. Essayez /aide, /regles ou /generer.');
        return;
      }
  }

  // ------------------------------------------------------------ TEXTE LIBRE
  // Tout ce qui n'est pas une commande est traité comme un mot de passe à tester.

  const candidat = texte;                         // JAMAIS journalisé (voir plus bas)
  if (!candidat.trim()) {
    await sendMessage(chatId, 'Envoyez-moi un mot de passe à analyser, ou /aide.');
    return;
  }

  // 1) Analyse locale, avec le MÊME moteur que la Mini App.
  const resultat = analyzePassword(candidat, COMMON_PASSWORDS);

  // 2) Suppression du message d'origine AVANT de répondre, pour que le mot de
  //    passe disparaisse le plus vite possible de la discussion.
  const supprime = await tryDeleteMessage(chatId, message.message_id);

  // 3) Réponse : résultat, puis rappel de sécurité.
  await sendMessage(chatId, rendreAnalyse(resultat));
  await sendMessage(chatId, messageSecurite(supprime), { reply_markup: clavierMiniApp() });
  await sendStickerIfConfigured(chatId, resultat.level);

  // NOTE : nulle part dans ce fichier nous n'écrivons `console.log(candidat)`.
  //        Journaliser un mot de passe serait la faute de sécurité classique :
  //        il finirait en clair dans les fichiers de logs du serveur.
  //        Никогда не логируем пароль.
}

/**
 * Aiguille une mise à jour (« update ») vers le bon traitement.
 * @param {object} update
 */
async function traiterUpdate(update) {
  try {
    if (update.message) {
      await traiterMessage(update.message);
    }
    // Les messages modifiés (edited_message) sont volontairement ignorés :
    // réanalyser un mot de passe déjà traité n'apporterait rien.
  } catch (error) {
    // Une erreur sur UN message ne doit jamais arrêter le bot entier.
    console.error('[update] erreur de traitement :', error.message);
  }
}

/* =============================================================================
 * 8. BOUCLE DE LONG POLLING
 *    Цикл long polling
 * ============================================================================= */

/**
 * Principe du long polling :
 *   • on appelle getUpdates avec timeout=30
 *   • Telegram GARDE la connexion ouverte jusqu'à 30 s en attendant un message
 *   • dès qu'un message arrive, il répond immédiatement
 *   • on note le plus grand update_id reçu et on renvoie offset = id + 1,
 *     ce qui confirme à Telegram que ces messages sont traités (sinon il les
 *     renverrait en boucle à l'infini).
 */

let enMarche = true;        // passe à false lors d'un Ctrl-C
let offset = 0;             // prochain update_id attendu

async function boucleDeSondage() {
  let backoff = 1000;       // délai d'attente après une erreur : 1 s au départ
  const BACKOFF_MAX = 60000;

  while (enMarche) {
    try {
      const debut = Date.now();
      const updates = await callApi(
        'getUpdates',
        {
          offset,
          timeout: 30,                       // secondes : c'est le « long » du long polling
          allowed_updates: ['message'],      // on ne demande que ce qu'on sait traiter
        },
        40000,                               // timeout HTTP > timeout Telegram (30 s)
      );

      backoff = 1000;                        // succès : on remet le backoff à zéro

      // Garde-fou : normalement le serveur garde la connexion ~30 s quand il
      // n'y a rien. Si jamais il répond « rien » instantanément (proxy mal
      // configuré, API simulée…), cette boucle tournerait à toute vitesse et
      // saturerait le processeur. On impose donc un rythme minimal.
      if (updates.length === 0 && Date.now() - debut < 1000) await sleep(1000);

      for (const update of updates) {
        if (!enMarche) break;
        offset = update.update_id + 1;       // on avance AVANT le traitement :
                                             // un message qui plante ne sera pas rejoué en boucle
        await traiterUpdate(update);
      }
    } catch (error) {
      if (!enMarche) break;                  // abandon volontaire pendant l'arrêt : normal

      // Cas fréquent : deux instances du bot tournent en même temps.
      if (error.telegram?.error_code === 409) {
        console.error('⚠️  Conflit : une autre instance de ce bot tourne déjà ' +
                      '(ou un webhook est actif). Arrêtez-la, puis relancez.');
      } else if (error.telegram?.error_code === 401) {
        console.error('❌ Token refusé par Telegram. Vérifiez BOT_TOKEN dans .env.');
        process.exit(1);
      } else if (error.telegram?.parameters?.retry_after) {
        // Limitation de débit : Telegram indique lui-même combien attendre.
        const attente = error.telegram.parameters.retry_after * 1000;
        console.warn(`⏳ Trop de requêtes, pause de ${error.telegram.parameters.retry_after} s.`);
        await sleep(attente);
        continue;
      } else {
        console.error(`[réseau] ${error.message} — nouvelle tentative dans ${backoff / 1000} s`);
      }

      // Backoff progressif : 1 s, 2 s, 4 s… jusqu'à 60 s maximum.
      // Évite de marteler le serveur quand le Wi-Fi est coupé.
      await sleep(backoff);
      backoff = Math.min(backoff * 2, BACKOFF_MAX);
    }
  }
}

/* =============================================================================
 * 9. DÉMARRAGE ET ARRÊT PROPRE
 *    Запуск и корректное завершение
 * ============================================================================= */

/** Enregistre le menu des commandes (celui du bouton « / » dans Telegram). */
async function declarerLesCommandes() {
  try {
    await callApi('setMyCommands', {
      commands: [
        { command: 'start',   description: 'Démarrer et ouvrir l’application' },
        { command: 'generer', description: 'Générer un mot de passe très fort' },
        { command: 'regles',  description: 'Les 4 niveaux de force' },
        { command: 'aide',    description: 'Comment fonctionne l’évaluation' },
      ],
    });
  } catch (error) {
    console.warn('[commandes] enregistrement impossible :', error.message);
  }
}

async function demarrer() {
  console.log('⏳ Connexion à Telegram…');

  // getMe = « qui suis-je ? ». Sert à valider le token dès le démarrage,
  // plutôt que de découvrir le problème au premier message.
  let moi;
  try {
    moi = await callApi('getMe');
  } catch (error) {
    console.error('❌ Impossible de contacter Telegram.');
    console.error('   ' + error.message);
    console.error('   Vérifiez votre connexion Internet et la validité de BOT_TOKEN.');
    process.exit(1);
  }

  console.log(`✅ Connecté en tant que @${moi.username} (${moi.first_name})`);
  console.log(
    MINIAPP_OK
      ? `🔗 Mini App : ${MINIAPP_URL}`
      : '⚠️  MINIAPP_URL absente ou non-HTTPS : le bouton d’ouverture sera masqué.',
  );
  console.log('🤖 En écoute (long polling). Ctrl-C pour arrêter.\n');

  await declarerLesCommandes();
  await boucleDeSondage();

  console.log('👋 Bot arrêté proprement.');
  process.exit(0);
}

/**
 * Arrêt propre : on sort de la boucle sans couper le message en cours de route.
 * Un second Ctrl-C force la sortie immédiate.
 */
let arretDemande = false;
function arreter(signal) {
  if (arretDemande) process.exit(1);              // deuxième Ctrl-C : on force
  arretDemande = true;
  enMarche = false;
  console.log(`\n⏹  Signal ${signal} reçu, arrêt en cours… (Ctrl-C à nouveau pour forcer)`);
  // Filet de sécurité : si la requête getUpdates en cours ne rend pas la main.
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => arreter('SIGINT'));
process.on('SIGTERM', () => arreter('SIGTERM'));

// Une promesse rejetée non gérée ne doit pas tuer le bot silencieusement.
process.on('unhandledRejection', (raison) => {
  console.error('[promesse non gérée]', raison?.message || raison);
});

demarrer();
