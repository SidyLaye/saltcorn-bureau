# Bureau — module Saltcorn

Un environnement de type système d'exploitation posé sur une page Saltcorn :
écran de veille, bureau à icônes, fenêtres déplaçables et redimensionnables,
barre des tâches, menu démarrer.

**Le module ne contient aucune application.** Chaque icône du bureau ouvre une
**vue** ou une **page** Saltcorn ordinaire, construite avec le page builder.
Ajouter, modifier ou retirer une application ne demande donc jamais de code :
une table, des vues, une ligne dans la configuration.

---

## Le principe

```
   Table          →   Vues (builder)      →   Icône du bureau
   bureau_note        notes_liste             « Notes »
                      notes_edition
```

Le bureau est une **coquille**. Quand vous double-cliquez une icône, il ouvre
une fenêtre et y charge `/view/<nom>` en fragment HTML, avec exactement le même
mécanisme que Saltcorn utilise pour ses onglets et accordéons paresseux
(en-têtes `pjaxpageload` et `localizedstate`, puis `initialize_page()`).

Deux conséquences pratiques :

- **Tout ce que Saltcorn sait faire fonctionne dans les fenêtres** : formulaires,
  liens de vue, actions, rechargement automatique après enregistrement.
- **Ce que vous construisez au builder est immédiatement utilisable** comme
  application, sans passer par moi ni par du code.

---

## Installation

### 1. Le module

```bash
saltcorn install-plugin -d /chemin/vers/saltcorn-bureau
```

Ou : ⚙ Settings → Modules → *Add another plugin* → source `local` → chemin du
dossier. Redémarrez Saltcorn.

### 2. Le pack (facultatif mais recommandé pour démarrer)

⚙ Settings → Modules → onglet *Packs* → **Install pack** → collez `pack.json`.

Il crée cinq tables de départ — `bureau_note`, `bureau_evenement`,
`bureau_tache`, `bureau_depense`, `bureau_pref` — toutes avec une colonne `user`
déclarée comme **champ de propriété**, ainsi que la vue `Bureau` (sans icône
pour l'instant).

> Installez le module **avant** le pack : la vue référence le view template
> `Bureau`, qui n'existe pas tant que le module n'est pas chargé.

`bureau_pref` sert à mémoriser la position des fenêtres par utilisateur. Les
quatre autres ne sont qu'un point de départ : supprimez-les, renommez-les,
ajoutez les vôtres.

### 3. La page

Pages → *Add page* → nom `bureau` → glissez un élément **View** → choisissez
`Bureau`. Pour que le bureau occupe tout l'écran, décochez *Default content in
card* dans la configuration du thème.

Enfin ⚙ Settings → About application → page d'accueil du rôle `user` : `bureau`.

---

## Créer une application — le geste à retenir

1. **Tables → Create table**, ajoutez vos colonnes, plus une clé `user` vers
   `users`. Dans l'onglet *Edit* de la table, réglez *Ownership field* sur `user`
   pour que chacun ne voie que ses lignes.
2. Sur la page de la table, bouton **Create views** : Saltcorn génère
   automatiquement les vues *List*, *Show* et *Edit*.
3. Retouchez-les au builder autant que vous voulez — colonnes, mise en page,
   boutons, vues imbriquées.
4. Vue `Bureau` → **Configure** → onglet *Applications* → **Add** :
   nom, icône, `Vue` + le nom de la vue, largeur, hauteur. Enregistrez.

L'icône apparaît sur le bureau. C'est tout.

### Champs d'une application

| Champ | Rôle |
|---|---|
| Nom | Le libellé sous l'icône et dans la barre des tâches |
| Icône | Une icône Font Awesome, choisie dans la liste (ou un fragment SVG collé tel quel) |
| Ouvre | `Vue`, `Page` ou `Lien externe` |
| Vue / Page | La cible, choisie parmi celles de l'instance |
| État initial | Paramètres passés à la vue : `statut=ouvert&tri=date` |
| Largeur / Hauteur | Taille de la fenêtre à l'ouverture, en pixels |
| Ouvrir au démarrage | La fenêtre s'ouvre dès l'arrivée sur le bureau |

Une application dont la cible dépasse les droits de l'utilisateur **n'apparaît
pas** : le module compare `role_id` au `min_role` de la vue ou de la page avant
de l'envoyer au client.

### Applications avec le page builder

Choisissez `Page` plutôt que `Vue` quand une application a besoin de plusieurs
blocs : une page peut contenir des conteneurs, des colonnes, des onglets, du
texte, et **plusieurs vues côte à côte**. C'est là que le page builder donne sa
pleine mesure — un tableau de bord, un éditeur avec sa liste à gauche et son
formulaire à droite, une fiche récapitulative.

---

## Ce que le module fournit

| Élément | Détail |
|---|---|
| **Fenêtres** | Déplacement par la barre de titre, redimensionnement par le coin bas-droit, actualiser / réduire / agrandir / fermer, double-clic sur le titre pour agrandir. L'agrandissement se fait **à l'échelle du bureau**, pas de l'écran : la barre des tâches reste visible |
| **Barre des tâches** | Un bouton par fenêtre, clic pour focus ou réduction, horloge, veille, déconnexion |
| **Menu démarrer** | Toutes les applications, veille, déconnexion |
| **Veille** | Automatique après N minutes d'inactivité (0 pour désactiver) ou manuelle. À la reprise, la session serveur est revérifiée ; si elle a expiré, redirection vers la connexion |
| **Positions mémorisées** | Par utilisateur, d'une session à l'autre, via la table des préférences |
| **Rappels** | Facultatifs : indiquez une table, une colonne de date et une colonne de délai — le bureau affiche une notification à l'approche de l'échéance |

---

## Configuration de la vue

**Onglet Système** — nom affiché, délai de veille, table des préférences,
colonne propriétaire, fond du bureau.

**Onglet Applications** — la liste des icônes, ajoutable à volonté.

**Onglet Alertes** — table, colonne du titre, colonne de la date, colonne du
délai en minutes. Laissez la table vide pour désactiver.

---

## Sécurité

- Les routes exigent une session authentifiée.
- La visibilité d'une application est décidée **côté serveur** par comparaison
  des rôles, avant l'envoi au client.
- L'ouverture d'une vue passe par la route normale `/view/<nom>`, donc par les
  contrôles d'accès habituels de Saltcorn — le bureau ne contourne rien.
- Les préférences sont lues et écrites filtrées sur l'utilisateur de la session.
- Les rappels sont lus avec `forUser`, donc soumis au champ ou à la formule de
  propriété de la table.

---

## Limite connue

Saltcorn ne permet pas à un module d'ajouter un **nouvel élément dans la palette
du builder** : la liste est figée dans le bundle React compilé à la publication
(`Builder.js`, `storage.js`, les cinq fonctions `Toolbox*`), et l'enregistrement
des plugins n'expose aucune clé pour cela. C'est vérifié dans le code source, pas
supposé.

Ce que le module fait à la place est la voie officielle : fournir un **view
template**, qui devient à la fois un choix de template à la création d'une vue et
un élément déposable partout via l'élément **View** du builder.

---

## Personnaliser l'apparence

Les couleurs, l'épaisseur des traits, le rayon des angles et l'ombre portée sont
en tête de `public/bureau.css` :

```css
.bureau {
  --br-fond: #0a0a0a;
  --br-surface: #111111;
  --br-encre: #f2f2f2;
  --br-trait: #f2f2f2;
  --br-trait-ep: 2px;
  --br-rayon: .375rem;
  --br-ombre: 4px 4px 0 0 var(--br-trait);
}
```

Le contenu des fenêtres, lui, porte le thème du site : c'est du Saltcorn
ordinaire. Pour un ensemble cohérent, réglez le thème Saltcorn en premier — les
variables ci-dessus reprennent la palette Brite Noir.

---

## Démonstration hors-ligne

`demo/index.html` rejoue la coquille complète avec de faux fragments de vues.
Ouvrez le fichier dans un navigateur, sans instance Saltcorn.
