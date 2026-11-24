# Mes dépenses

Application personnelle pour suivre les dépenses mensuelles, avec catégories personnalisables, historique, évolution et sauvegarde JSON.

- Sans compte ni serveur.
- Données stockées dans le navigateur de chaque appareil.
- PWA fonctionnant hors ligne après première ouverture.
- GitHub Pages : Settings > Pages > Deploy from a branch > main > /(root).

**Attention :** sauvegarder régulièrement via le bouton Exporter. Les données ne sont pas synchronisées entre appareils.

## Cycles de paie et analyses

- « J’ai reçu ma paie » propose la date locale du jour et demande le montant net réellement reçu. Le revenu moyen de 2 200 € reste une prévision, jamais un revenu ajouté au salaire réel.
- Une réception confirmée commence un cycle. La réception suivante en fixe la fin, la veille. Le 25 est uniquement la prévision du prochain mois ; il ne crée pas de cycle automatique.
- Les dates identiques sont refusées. Une correction ou une annulation recalcule les intervalles sans changer les dépenses. Deux paies à moins de 20 jours demandent une confirmation supplémentaire.
- Les mois calendaires, catégories, historiques, graphiques et opérations sur les dépenses restent disponibles. Avant la première réception connue, l’historique se consulte par mois ; aucune date de paie passée n’est inventée.
- Les comparaisons portent sur une même durée depuis le début des périodes. Les rapports précisent l’arrêté, les jours observés, les hypothèses et la complétude inconnue des saisies. Ils contiennent les dépenses datées et restent générés localement, à copier manuellement dans ChatGPT.

### Calcul du budget

Paramètres initiaux : charges fixes 1 100 €, épargne hors Bitcoin 200 €, DCA Bitcoin 10 €/semaine. Ces réserves ne constituent pas une preuve de paiement. Les charges sont suivies séparément.

Le disponible est le salaire net confirmé, moins les dépenses variables enregistrées, moins chacune des trois réserves. Pour chaque réserve, on retient le maximum entre le montant prévu et les montants saisis de cette nature. Ainsi, une dépense marquée « charge fixe », « DCA Bitcoin » ou « versement d’épargne » n’est pas déduite deux fois ; un dépassement réduit le disponible.

Les anciennes dépenses restent inchangées et sont interprétées comme variables. Modifier leur nature si nécessaire ; le nom de catégorie ne déclenche aucune classification automatique.

Le jour du DCA est initialement inconnu : le montant est estimé au prorata des jours et arrondi au centime. Une fois le jour hebdomadaire renseigné, les échéances sont comptées sur l’intervalle du cycle, début inclus et fin exclue. Une fin non confirmée reste prévisionnelle. Après l’échéance prévue, le disponible n’est plus présenté comme déterminé. Un cycle clôturé de moins de 20 ou de plus de 40 jours est signalé et son disponible est suspendu : une paie manquante ou annulée pourrait rendre une enveloppe mensuelle inadaptée.

Chaque paie conserve une copie de ses paramètres. Changer les prévisions affecte les prochaines confirmations. « Ajuster les prévisions du cycle » applique explicitement les paramètres actuellement enregistrés au cycle affiché. Le montant net se corrige dans les paies enregistrées. Le disponible n’est pas un solde bancaire et le repère quotidien exclut la journée en cours.

## Conservation et récupération

Le format exporté est désormais `version: 2`. Les sauvegardes version 1 et l’ancien stockage sans version sont acceptés. Les identifiants, dates, montants, descriptions et autres champs existants des dépenses sont conservés. Les versions inconnues, dates impossibles et identifiants dupliqués sont refusés avant toute modification. La limite d’import est de 5 Mo, comme dans la version précédente.

Le stockage actif utilise `mes-depenses-v2`. L’ancienne clé `mes-depenses-demo-v1` reste intacte. La migration est enregistrée au premier changement réussi, avec une copie exacte du contenu original. Une version 2 illisible ne provoque jamais un retour silencieux à l’ancien stockage : les écritures ordinaires sont bloquées et la récupération est proposée.

« Récupérer une copie de sécurité » permet de télécharger :

- les données actives brutes ;
- l’état précédant le dernier enregistrement ;
- les anciennes données et la copie initiale avant migration ;
- les données précédant le dernier import, conservées au-delà des sauvegardes ordinaires suivantes ;
- le contenu illisible préservé lors d’une restauration, le cas échéant.

Pour restaurer, télécharger la copie choisie puis utiliser « Importer une sauvegarde ». L’import remplace les données après confirmation ; il ne fusionne pas automatiquement deux jeux de données. Une copie valide de récupération n’est pas écrasée par un contenu corrompu. Si la création d’une copie ou l’écriture échoue, aucun succès n’est affiché et l’état confirmé de l’application est conservé.

Les anciens onglets continuent d’utiliser l’ancienne clé : ils ne peuvent pas écraser les données version 2. Une modification de l’ancien stockage est signalée. Fermer les anciens onglets et exporter les deux copies avant toute réconciliation ; les nouvelles saisies d’une ancienne version ne sont pas fusionnées automatiquement.

L’effacement des données actives conserve les copies de récupération ; le message de confirmation le précise. Ces copies locales ne remplacent pas un export externe : l’effacement du stockage du navigateur peut toutes les supprimer. Une sauvegarde v2 ne doit pas être restaurée dans l’ancienne application, qui ne connaît pas les paies et peut ignorer ces informations.

## Fichiers et vérification

- `index.html` : interface existante étendue et gestion des interactions.
- `budget.js` : dates civiles, centimes, cycles, rapports, validation et stockage ; aucun service externe ni dépendance d’exécution.
- `sw.js` : cache v30 comprenant le moteur budgétaire. Le HTML et le module sont servis depuis la même version installée. Une mise à jour complète s’utilise après rechargement ; une installation incomplète conserve l’ancienne version.
- `tests/core.test.cjs` et `tests/offline.test.cjs` : tests Node.js sans dépendance.
- `tests/browser.test.cjs` : scénarios Chromium avec Playwright, uniquement outil de développement, profils jetables et données fictives.

Tests sans navigateur :

```sh
node --test tests/core.test.cjs tests/offline.test.cjs
```

Tests navigateur, avec Playwright et son Chromium déjà disponibles dans l’environnement :

```sh
node --test tests/browser.test.cjs
```

`BASELINE_DIR` peut désigner une copie du commit `2fec53e` pour tester la mise à jour v29 → v30. Sans ce dossier, ce scénario est explicitement ignoré. `FILE_MODE=1` permet les tests d’interface sur fichiers locaux lorsque le réseau loopback est interdit ; les deux scénarios de véritable service worker sont alors explicitement ignorés. `SCREENSHOT_DIR` permet de conserver les captures de contrôle.

Les tests du cache en mémoire ne remplacent pas une validation réelle du service worker. Les scénarios Chromium restent disponibles pour une vérification ultérieure depuis un serveur local autorisé. Aucun déploiement n’est effectué par les tests.

### Validation de cette version

Version préparée à partir de main au commit 04fbc14ea3bd4c983efc3358d08d5a57cdbcecb7. L’icône et le manifeste sont conservés.

- 30 tests des calculs, dates, centimes, sauvegardes JSON v1/v2 et récupération.
- 7 tests du service worker en environnement simulé.
- 7 scénarios Chromium sur fichiers locaux, avec données fictives et profils dédiés, couvrant notamment le bouton de paie et le budget affiché sans double comptage.
- Les deux scénarios Chromium de redémarrage hors ligne et de mise à jour v19 vers v20 restent non validés : le serveur local était inaccessible depuis le sandbox. La publication du 21 novembre 2026 est autorisée avec cette limite explicitement acceptée.

La correction de l’option Lundi du DCA est couverte par le test du budget affiché. Les tests vérifient la conservation exacte des dépenses de référence lors de la migration et de l’aller-retour JSON ; ils ne modifient pas les données personnelles de l’utilisateur.

### Contrôles sur Android après mise à jour

Conserver un export JSON externe avant la mise à jour. Ouvrir l’application installée habituelle avec une connexion réseau ; si nécessaire, la fermer puis la rouvrir pour charger la version installée. Ne pas désinstaller l’application ni effacer le stockage.

Vérifier les totaux du mois actuel et d’un ancien mois, les catégories et plusieurs dépenses datées. Vérifier la présence du bouton de paie ; ne confirmer que des réceptions réelles, avec leur date et leur montant net. Renseigner le jour hebdomadaire du DCA pour remplacer son estimation au prorata. Exporter ensuite une nouvelle sauvegarde version 2 sans écraser la sauvegarde version 1.

Enfin, après une ouverture connectée, fermer et rouvrir l’application en mode avion pour contrôler l’accès hors ligne. En cas d’anomalie, garder toutes les copies et ne pas réinitialiser le stockage ; un import ne doit servir qu’à une restauration volontaire après diagnostic.
