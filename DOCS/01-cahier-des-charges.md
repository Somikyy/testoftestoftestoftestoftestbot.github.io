# Conformité au cahier des charges

> Document de correction — il montre, exigence par exigence, **où** dans le code
> chaque point du cahier des charges est réalisé.
> (RU: документ для преподавателя — таблица соответствия ТЗ и кода.)

Projet : **Application de vérification de la force d'un mot de passe**
Forme retenue : **Mini App Telegram** (application web intégrée à Telegram) + **bot Telegram**.

---

## 1. Objectif du projet

> « Développer une application permettant à un utilisateur de tester la robustesse de son
> mot de passe selon des critères de sécurité standards. »

| Élément | Réalisation |
|---|---|
| Application utilisable | Mini App Telegram, ouverte depuis un bot, sur mobile et bureau |
| Test de robustesse | `analyzePassword()` dans `miniapp/strength.js` |
| Critères standards | Longueur, minuscules, majuscules, chiffres, caractères spéciaux |

**Choix de conception majeur : l'analyse est 100 % locale.**
Le mot de passe est traité en JavaScript dans la page ; il n'est envoyé à aucun serveur,
n'est écrit dans aucun stockage, n'apparaît dans aucun journal. C'est la seule façon
correcte de construire un tel outil : *un vérificateur de mot de passe qui envoie le mot de
passe sur le réseau est lui-même une faille de sécurité.*

---

## 2. Fonctionnalités principales

### 2.1 Vérification de la force du mot de passe

| Exigence | Où c'est fait | Comment |
|---|---|---|
| **Analyse en temps réel lors de la saisie** | `miniapp/app.js` | Écouteur `input` sur le champ ; à chaque frappe l'analyse est relancée et toute l'interface est mise à jour |
| Longueur minimale (ex. ≥ 8) | `strength.js` → `CONFIG.MIN_LENGTH_CRITERION` | Constante modifiable en un seul endroit |
| Présence de majuscules et minuscules | `strength.js` → `detectTypes()` | Expressions régulières Unicode `\p{Lu}` / `\p{Ll}` |
| Présence de chiffres | `strength.js` → `detectTypes()` | `\p{Nd}` |
| Présence de caractères spéciaux | `strength.js` → `detectTypes()` | `[^\p{L}\p{N}]` — tout ce qui n'est ni lettre ni chiffre |

### 2.2 Affichage du niveau de sécurité

| Exigence | Réalisation |
|---|---|
| Niveau : Faible / Moyen / Fort / Très fort | Libellés français exacts, définis dans `miniapp/i18n.js` (clés `level_faible`, `level_moyen`, `level_fort`, `level_tres_fort`) |
| Affichage | Grand libellé coloré + barre de force à 4 segments + emoji animé réagissant au niveau |

---

## 3. Règles de classification

Les règles sont déclarées **de façon déclarative** dans `strength.js` :

```js
LEVELS: [
  { id: 'tres_fort', index: 3, minLength: 16, minTypes: 4 },
  { id: 'fort',      index: 2, minLength: 12, minTypes: 3 },
  { id: 'moyen',     index: 1, minLength: 8,  minTypes: 2 },
  { id: 'faible',    index: 0, minLength: 0,  minTypes: 0 },
]
```

`classify()` parcourt cette liste **du plus fort au plus faible** et retient le premier niveau
dont **toutes** les conditions sont satisfaites.

| Niveau du cahier des charges | Condition implémentée | Vérifié par |
|---|---|---|
| **Faible** | tout ce qui ne satisfait aucun autre niveau : < 8 caractères, ou un seul type de caractère | `tests/strength.test.js` |
| **Moyen** | longueur ≥ 8 **et** ≥ 2 types parmi les 4 | idem |
| **Fort** | longueur ≥ 12 **et** ≥ 3 types | idem |
| **Très fort** | longueur ≥ 16 **et** les 4 types | idem |

### 3.1 Une ambiguïté du cahier des charges, et comment elle est traitée

Le cahier des charges décrit « Faible » par trois puces :

1. Moins de 8 caractères
2. Contient uniquement des lettres ou uniquement des chiffres
3. **Aucun caractère spécial**

Pris littéralement, le point 3 **contredit** la règle « Moyen », qui n'exige que 2 types de
caractères parmi 4 : le mot de passe `Bonjour123` possède 3 types (minuscules, majuscules,
chiffres) et 10 caractères — il est donc « Moyen » selon la règle 2, mais « Faible » selon la
puce 3 de la règle 1.

**Décision retenue :** les règles 2, 3 et 4 (qui sont chiffrées et sans ambiguïté) font foi ;
les puces de la règle 1 sont lues comme une *description* du cas par défaut. Les points 1 et 2
sont alors automatiquement vérifiés :

- moins de 8 caractères → « Moyen » impossible → **Faible** ✅
- un seul type de caractère → `typesCount = 1 < 2` → **Faible** ✅

**Si le correcteur exige la lecture littérale**, une seule ligne est à changer dans
`miniapp/strength.js` :

```js
STRICT_SPECIAL_CHAR_RULE: true,   // aucun caractère spécial => Faible, sans discussion
```

Ce comportement est couvert par un test dédié.

---

## 4. Ce qui va au-delà du cahier des charges (bonus)

Ces éléments sont **signalés comme bonus dans l'interface** et **ne modifient jamais** le niveau
officiel calculé selon le cahier des charges.

| Bonus | Intérêt |
|---|---|
| Détection des mots de passe les plus courants | `Password123!` respecte les règles mais est cassé en une seconde |
| Estimation de l'entropie (bits) | Mesure classique en sécurité |
| Estimation du temps de cassage hors ligne | Rend le résultat concret pour l'utilisateur |
| Détection des répétitions (`aaaa`) et des suites (`1234`, `azerty`) | Faiblesses classiques |
| Générateur de mot de passe « Très fort » | Utilise `crypto.getRandomValues()`, pas `Math.random()` |
| Interface multilingue FR / RU / EN | Le français reste la langue par défaut |
| Tests unitaires | `npm test` |

> Le drapeau `CONFIG.DOWNGRADE_COMMON_PASSWORDS` permet de faire descendre un mot de passe
> courant au niveau « Faible ». Il vaut `false` par défaut, précisément pour rester
> **strictement conforme** au cahier des charges.

---

## 5. Architecture

```
password checker/
├── miniapp/            Application web (la Mini App Telegram)
│   ├── strength.js     ← LE MOTEUR : toutes les règles du cahier des charges
│   ├── app.js          ← Interface, analyse en temps réel, intégration Telegram
│   ├── i18n.js         ← Textes FR / RU / EN
│   ├── index.html
│   └── style.css
├── bot/                Bot Telegram (point d'entrée vers la Mini App)
│   └── bot.js          ← Réutilise EXACTEMENT le même moteur strength.js
├── tests/
│   └── strength.test.js
└── DOCS/               Cette documentation
```

**Point important :** le bot et la Mini App importent le **même** fichier `strength.js`.
Il n'y a donc qu'une seule implémentation des règles, impossible de les voir diverger.

---

## 6. Vérification

```bash
node --test tests/*.test.js
```

Les tests couvrent les quatre niveaux, **les frontières exactes** (7 vs 8, 11 vs 12, 15 vs 16
caractères ; 1 vs 2, 2 vs 3, 3 vs 4 types), les cas limites (chaîne vide, valeurs non textuelles,
Unicode, emoji) et le générateur.
