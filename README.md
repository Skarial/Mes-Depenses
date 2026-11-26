# Mes dépenses

Application personnelle pour suivre les dépenses mensuelles, avec catégories personnalisables, historique, évolution et sauvegarde JSON.

- Sans compte ni serveur.
- Données stockées dans le navigateur de chaque appareil.
- PWA fonctionnant hors ligne après première ouverture.
- GitHub Pages : Settings > Pages > Deploy from a branch > main > /(root).

**Attention :** sauvegarder régulièrement via le bouton Exporter. Les données ne sont pas synchronisées entre appareils.

## Cycles de paie et analyses

- « Paie » ouvre le formulaire de date, prérempli avec la date locale du jour. Confirmer cette date démarre le cycle.
- À l’ouverture, le filtre affiche le dernier cycle de paie confirmé. Sans paie enregistrée, il affiche le mois calendaire.
- Une réception confirmée commence un cycle. La réception suivante en fixe la fin, la veille. Le 25 est uniquement la prévision du prochain mois ; il ne crée pas de cycle automatique.
- Les dates identiques sont refusées. Une correction ou une annulation recalcule les intervalles sans changer les dépenses. Deux paies à moins de 20 jours demandent une confirmation supplémentaire.
- Les mois calendaires, catégories, historiques, graphiques et opérations sur les dépenses restent disponibles. Avant la première réception connue, l’historique se consulte par mois ; aucune date de paie passée n’est inventée.
- Les comparaisons portent sur une même durée depuis le début des périodes. Les rapports précisent l’arrêté, les jours observés, les hypothèses et la complétude inconnue des saisies. Ils contiennent les dépenses datées et restent générés localement, à copier manuellement dans ChatGPT.

### Dépenses et prévisions du cycle

Paramètres initiaux : charges fixes 1 100 €, épargne hors Bitcoin 200 €, DCA Bitcoin 10 €/semaine. Ces réserves ne constituent pas une preuve de paiement. Les charges sont suivies séparément.

Le journal et les graphiques reposent sur les dépenses enregistrées pendant la période affichée. Le résumé à date exclut les saisies futures. Dans Budget, les montants saisis par nature sont présentés à côté des prévisions correspondantes.

Les anciennes dépenses restent inchangées et sont interprétées comme variables. Modifier leur nature si nécessaire ; le nom de catégorie ne déclenche aucune classification automatique.

Le jour du DCA est initialement inconnu : le montant est estimé au prorata des jours et arrondi au centime. Une fois le jour hebdomadaire renseigné, les échéances sont comptées sur l’intervalle du cycle, début inclus et fin exclue. Tant que la date prévue n’est pas atteinte, le DCA est projeté jusqu’à la veille de cette date. À partir de la date prévue, le cycle reste ouvert et le DCA est compté jusqu’au jour courant. Un cycle clôturé de moins de 20 ou de plus de 40 jours est signalé.

Chaque paie conserve une copie de ses paramètres. Changer les prévisions affecte les prochaines confirmations. « Ajuster les prévisions du cycle » applique explicitement les paramètres actuellement enregistrés au cycle affiché.

## Conservation et récupération

Le format courant est `version: 3`. L’import accepte aussi les formats 1, 2 et sans numéro de version. La conversion conserve les dépenses, dates et paramètres de cycle, le patrimoine et les objectifs. Les champs historiques de salaire et de revenu prévu sont retirés de l’état courant et des nouveaux exports standards. Les versions inconnues, dates impossibles et identifiants dupliqués sont refusés avant toute modification. La limite d’import est de 5 Mo, comme dans la version précédente.

Le stockage actif utilise `mes-depenses-v2`. L’ancienne clé `mes-depenses-demo-v1` reste intacte. La migration est enregistrée au premier changement réussi. Une copie exacte des données actives avant conversion depuis la version 2 est enregistrée à part. Des données illisibles bloquent les écritures ordinaires et déclenchent la proposition de récupération.

« Récupérer une copie de sécurité » permet de télécharger :

- les données actives brutes ;
- l’état précédant le dernier enregistrement ;
- les anciennes données, la copie initiale avant migration et la copie avant la mise à jour des cycles de paie ;
- les données précédant le dernier import, conservées au-delà des sauvegardes ordinaires suivantes ;
- le contenu illisible préservé lors d’une restauration, le cas échéant.

Pour restaurer, télécharger la copie choisie puis utiliser « Importer une sauvegarde ». L’import remplace les données après confirmation ; il ne fusionne pas automatiquement deux jeux de données. Une copie valide de récupération n’est pas écrasée par un contenu corrompu. Si la création d’une copie ou l’écriture échoue, aucun succès n’est affiché et l’état confirmé de l’application est conservé.

Lorsqu’un autre onglet a modifié le stockage, une écriture concurrente est refusée. Après une mise à jour, recharge les anciens onglets avant d’y saisir des données.

L’effacement des données actives conserve les copies de récupération ; le message de confirmation le précise. Ces copies locales ne remplacent pas un export externe : l’effacement du stockage du navigateur peut toutes les supprimer. Les anciennes versions de l’application ne lisent pas le format 3.

## Fichiers et vérification

- `index.html` : interface existante étendue et gestion des interactions.
- `budget.js` : dates civiles, centimes, cycles, rapports, validation et stockage ; aucun service externe ni dépendance d’exécution.
- `sw.js` : cache v33 comprenant le moteur budgétaire et les icônes PNG. Une mise à jour utilise le cache de la nouvelle version après installation complète et rechargement. Une installation incomplète conserve l’ancienne version.
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

`BASELINE_DIR` peut désigner une copie du commit `7c970e2` pour tester la mise à jour v32 → v33. Sans ce dossier, ce scénario est explicitement ignoré. `BROWSER_PROFILE_DIR` permet de choisir un dossier de profils de test, par exemple un chemin temporaire plus court sous Windows. `FILE_MODE=1` permet les tests d’interface sur fichiers locaux lorsque le réseau loopback est interdit ; les deux scénarios de véritable service worker sont alors explicitement ignorés. `SCREENSHOT_DIR` permet de conserver les captures de contrôle.

### Contrôles sur Android après mise à jour

Conserver un export JSON externe avant la mise à jour. Ouvrir l’application installée habituelle avec une connexion réseau ; si nécessaire, la fermer puis la rouvrir pour charger la version installée. Ne pas désinstaller l’application ni effacer le stockage.

Vérifier les totaux du mois actuel et d’un ancien mois, les catégories et plusieurs dépenses datées. Vérifier le bouton « Paie » et la liste des dates confirmées. Exporter ensuite une nouvelle sauvegarde au format 3.

Enfin, après une ouverture connectée, fermer et rouvrir l’application en mode avion pour contrôler l’accès hors ligne. En cas d’anomalie, garder toutes les copies et ne pas réinitialiser le stockage ; un import ne doit servir qu’à une restauration volontaire après diagnostic.
