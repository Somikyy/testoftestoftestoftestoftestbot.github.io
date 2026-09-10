/**
 * =============================================================================
 *  fetch-emoji.mjs — SCRIPT OPTIONNEL (le bot marche très bien sans)
 *  Необязательный скрипт: скачивает анимации Telegram и кладёт их в Mini App
 * =============================================================================
 *
 *  À QUOI ÇA SERT ?
 *  Télécharger de VRAIS stickers / emoji animés Telegram et les convertir en
 *  fichiers JSON Lottie utilisables par la Mini App, dans :
 *      ../miniapp/lottie/
 *
 *  POURQUOI UNE CONVERSION ?
 *  Un fichier « .tgs » (le format des animations Telegram) n'est rien d'autre
 *  qu'un fichier JSON Lottie COMPRESSÉ en gzip. On le décompresse donc avec
 *  zlib.gunzipSync() — module intégré à Node, aucune dépendance npm.
 *      .tgs  ==(gunzip)==>  .json Lottie  ==(lottie-web / dotlottie)==>  animation
 *
 *  RAPPEL IMPORTANT SUR LES EMOJI PREMIUM
 *  Un bot ne peut ENVOYER des emoji personnalisés (premium) dans un message
 *  que s'il possède un nom d'utilisateur acheté sur Fragment. En revanche,
 *  LES TÉLÉCHARGER avec ce script est autorisé pour tout le monde, et la
 *  Mini App (une simple page web) peut afficher l'animation sans aucune
 *  restriction. C'est exactement la stratégie de ce projet.
 *
 * -----------------------------------------------------------------------------
 *  UTILISATION
 * -----------------------------------------------------------------------------
 *    # (a) Tout un jeu de stickers, par son nom (celui de l'URL t.me/addstickers/…)
 *    node fetch-emoji.mjs --set AnimatedEmojies
 *
 *    # (b) Des emoji personnalisés précis, par leur identifiant
 *    node fetch-emoji.mjs --emoji 5368324170671202286 5370870893004203704
 *
 *    # Les deux à la fois, c'est possible :
 *    node fetch-emoji.mjs --set AnimatedEmojies --emoji 5368324170671202286
 *
 * -----------------------------------------------------------------------------
 *  COMMENT TROUVER UN custom_emoji_id ? (la question qui bloque tout le monde)
 * -----------------------------------------------------------------------------
 *    1. Démarrez le bot normalement :  node bot.js
 *    2. Depuis un compte Telegram Premium, envoyez au bot un message contenant
 *       l'emoji animé qui vous intéresse.
 *    3. Telegram place alors, dans la mise à jour reçue, un tableau
 *       message.entities contenant un objet du type :
 *
 *           { type: "custom_emoji", offset: 0, length: 2,
 *             custom_emoji_id: "5368324170671202286" }
 *
 *       C'est CE champ « custom_emoji_id » qu'il faut copier.
 *    4. Pour le voir, ajoutez temporairement dans traiterMessage() de bot.js :
 *
 *           console.log(JSON.stringify(message.entities, null, 2));
 *
 *       (à retirer ensuite : ce n'est utile qu'une seule fois)
 *
 *    Sans compte Premium, utilisez l'option --set : les jeux de stickers
 *    animés publics sont accessibles à tout le monde.
 * =============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* =============================================================================
 * 1. CONFIGURATION (même mini-parseur .env que bot.js, ce script est autonome)
 * ============================================================================= */

function parseEnvFile(filePath) {
  const result = {};
  if (!fs.existsSync(filePath)) return result;
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && /^["'].*["']$/s.test(value) && value[0] === value.at(-1)) {
      value = value.slice(1, -1);
    }
    if (key) result[key] = value;
  }
  return result;
}

const env = { ...parseEnvFile(path.join(__dirname, '.env')), ...process.env };
const BOT_TOKEN = (env.BOT_TOKEN || '').trim();

// Dossier de destination : la Mini App y lira les animations.
const OUTPUT_DIR = path.join(__dirname, '..', 'miniapp', 'lottie');

const API  = `https://api.telegram.org/bot${BOT_TOKEN}`;
const FILE = `https://api.telegram.org/file/bot${BOT_TOKEN}`;

/* =============================================================================
 * 2. LECTURE DES ARGUMENTS DE LA LIGNE DE COMMANDE
 * ============================================================================= */

/**
 * Transforme process.argv en { sets: [...], emojiIds: [...] }.
 * Analyse volontairement simple : un drapeau, puis ses valeurs.
 */
function lireArguments(argv) {
  const sets = [];
  const emojiIds = [];
  let mode = null;

  for (const arg of argv) {
    if (arg === '--set' || arg === '-s') { mode = 'set'; continue; }
    if (arg === '--emoji' || arg === '-e') { mode = 'emoji'; continue; }
    if (arg === '--help' || arg === '-h') { mode = 'help'; break; }
    if (mode === 'set') sets.push(arg);
    else if (mode === 'emoji') emojiIds.push(arg);
    else if (/^\d{6,}$/.test(arg)) emojiIds.push(arg);  // un long nombre = un custom_emoji_id
    else sets.push(arg);                                 // sinon = un nom de jeu
  }
  return { sets, emojiIds, aide: mode === 'help' };
}

function afficherAide() {
  console.log(`
Téléchargement d'animations Telegram (.tgs) vers du JSON Lottie.

  node fetch-emoji.mjs --set <nom_du_jeu> [autre_jeu…]
  node fetch-emoji.mjs --emoji <custom_emoji_id> [autre_id…]

Exemples :
  node fetch-emoji.mjs --set AnimatedEmojies
  node fetch-emoji.mjs --emoji 5368324170671202286

Les fichiers sont écrits dans : ${OUTPUT_DIR}
Un custom_emoji_id se lit dans message.entities[].custom_emoji_id
(voir l'explication détaillée en haut de ce fichier).
`);
}

/* =============================================================================
 * 3. APPELS À LA BOT API
 * ============================================================================= */

/** Appel JSON générique, avec délai maximal. */
async function callApi(method, payload = {}, timeoutMs = 20000) {
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
    if (!data.ok) throw new Error(`${method} : ${data.description || 'erreur inconnue'}`);
    return data.result;
  } finally {
    clearTimeout(timer);
  }
}

/** Télécharge le contenu binaire d'un fichier Telegram à partir de son file_id. */
async function telechargerFichier(fileId) {
  // Étape 1 : demander le chemin interne du fichier.
  const info = await callApi('getFile', { file_id: fileId });
  if (!info.file_path) throw new Error('chemin de fichier absent dans la réponse');

  // Étape 2 : le télécharger sur le domaine « file » de l'API.
  const response = await fetch(`${FILE}/${info.file_path}`);
  if (!response.ok) throw new Error(`téléchargement HTTP ${response.status}`);
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    filePath: info.file_path,
  };
}

/* =============================================================================
 * 4. CONVERSION .tgs -> JSON LOTTIE
 * ============================================================================= */

/**
 * Décompresse un .tgs et vérifie que c'est bien du Lottie.
 * @param {Buffer} buffer contenu brut du .tgs
 * @returns {object} animation Lottie
 */
function tgsVersLottie(buffer) {
  // Un gzip commence toujours par les octets 0x1F 0x8B.
  if (buffer.length < 2 || buffer[0] !== 0x1f || buffer[1] !== 0x8b) {
    throw new Error('ce fichier n’est pas un .tgs gzippé');
  }
  const json = zlib.gunzipSync(buffer).toString('utf8');
  const lottie = JSON.parse(json);
  // Un Lottie possède au minimum une largeur, une hauteur et des calques.
  if (typeof lottie !== 'object' || !('layers' in lottie)) {
    throw new Error('JSON décompressé mais ce n’est pas une animation Lottie');
  }
  return lottie;
}

/** Nettoie une chaîne pour en faire un nom de fichier sûr. */
function nomDeFichierSur(base) {
  const propre = String(base).replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return propre || 'animation';
}

/**
 * Traite un sticker : télécharge, convertit, écrit sur le disque.
 * @param {object} sticker objet Sticker de la Bot API
 * @param {string} prefixe préfixe du nom de fichier
 * @param {number} indice numéro dans le lot
 * @returns {Promise<'ok'|'ignore'|'erreur'>}
 */
async function traiterSticker(sticker, prefixe, indice) {
  const etiquette = `${prefixe}[${indice}] ${sticker.emoji || ''}`.trim();

  // Trois formats existent : .tgs (animé), .webm (vidéo), .webp (image fixe).
  // Seul le .tgs se convertit en Lottie.
  if (!sticker.is_animated) {
    const type = sticker.is_video ? 'vidéo (.webm)' : 'image fixe (.webp)';
    console.log(`   ⏭  ${etiquette} — ignoré : ${type}, non convertible en Lottie`);
    return 'ignore';
  }

  try {
    const { buffer } = await telechargerFichier(sticker.file_id);
    const lottie = tgsVersLottie(buffer);

    const nom = nomDeFichierSur(
      sticker.custom_emoji_id
        ? `emoji_${sticker.custom_emoji_id}`
        : `${sticker.set_name || prefixe}_${String(indice).padStart(2, '0')}`,
    );
    const destination = path.join(OUTPUT_DIR, `${nom}.json`);
    fs.writeFileSync(destination, JSON.stringify(lottie));

    const taille = (fs.statSync(destination).size / 1024).toFixed(1);
    console.log(`   ✅ ${etiquette} → ${path.basename(destination)} (${taille} Ko)`);
    return 'ok';
  } catch (error) {
    console.log(`   ❌ ${etiquette} — échec : ${error.message}`);
    return 'erreur';
  }
}

/* =============================================================================
 * 5. PROGRAMME PRINCIPAL
 * ============================================================================= */

async function principal() {
  const { sets, emojiIds, aide } = lireArguments(process.argv.slice(2));

  if (aide || (sets.length === 0 && emojiIds.length === 0)) {
    afficherAide();
    return;
  }

  if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN manquant.');
    console.error('   Renseignez-le dans le fichier .env (voir .env.example),');
    console.error('   ou lancez : BOT_TOKEN=… node fetch-emoji.mjs --set AnimatedEmojies');
    process.exitCode = 1;
    return;
  }

  // Création du dossier de destination si besoin (récursif = pas d'erreur s'il existe).
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`📁 Destination : ${OUTPUT_DIR}\n`);

  const bilan = { ok: 0, ignore: 0, erreur: 0 };
  const compter = (r) => { bilan[r] += 1; };

  // --- (a) Jeux de stickers -------------------------------------------------
  for (const nomDuJeu of sets) {
    console.log(`🎞  Jeu de stickers « ${nomDuJeu} »`);
    try {
      const jeu = await callApi('getStickerSet', { name: nomDuJeu });
      console.log(`   ${jeu.stickers.length} sticker(s) trouvé(s) — type : ${jeu.sticker_type}`);
      for (const [i, sticker] of jeu.stickers.entries()) {
        compter(await traiterSticker(sticker, nomDuJeu, i));
      }
    } catch (error) {
      // Erreur la plus fréquente : « STICKERSET_INVALID » = nom de jeu inexistant.
      console.log(`   ❌ Jeu inaccessible : ${error.message}`);
      bilan.erreur += 1;
    }
    console.log('');
  }

  // --- (b) Emoji personnalisés ---------------------------------------------
  if (emojiIds.length) {
    console.log(`😀 Emoji personnalisés (${emojiIds.length} identifiant(s))`);
    try {
      // L'API accepte jusqu'à 200 identifiants par appel.
      const stickers = await callApi('getCustomEmojiStickers', {
        custom_emoji_ids: emojiIds.slice(0, 200),
      });
      if (!stickers.length) {
        console.log('   ⚠️  Aucun emoji renvoyé : les identifiants sont probablement invalides.');
      }
      for (const [i, sticker] of stickers.entries()) {
        compter(await traiterSticker(sticker, 'emoji', i));
      }
    } catch (error) {
      console.log(`   ❌ Requête impossible : ${error.message}`);
      bilan.erreur += 1;
    }
    console.log('');
  }

  // --- Bilan ----------------------------------------------------------------
  console.log('─'.repeat(58));
  console.log(`Bilan : ${bilan.ok} converti(s), ${bilan.ignore} ignoré(s), ${bilan.erreur} échec(s).`);
  if (bilan.ok > 0) {
    console.log('\nDans la Mini App, chargez une animation ainsi :');
    console.log("   const data = await fetch('lottie/mon_animation.json').then(r => r.json());");
    console.log('   // puis lottie.loadAnimation({ container, animationData: data, loop: true });');
  }
}

// Filet de sécurité : aucune erreur ne doit produire une trace illisible.
// Absence de réseau, DNS injoignable, coupure Wi-Fi… on explique calmement.
principal().catch((error) => {
  const horsLigne = /fetch failed|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|aborted|timeout/i.test(
    `${error?.message} ${error?.cause?.code || ''}`,
  );
  console.error(
    horsLigne
      ? '\n🌐 Impossible de joindre Telegram : vérifiez votre connexion Internet.\n' +
        '   Aucun fichier n’a été modifié, vous pouvez relancer le script plus tard.'
      : `\n❌ Erreur inattendue : ${error?.message || error}`,
  );
  process.exitCode = 1;
});
