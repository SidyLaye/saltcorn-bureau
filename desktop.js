/**
 * View template « Bureau »
 * -----------------------------------------------------------------
 * Le bureau n'embarque plus aucune application codée en dur.
 *
 * Chaque icône du bureau pointe vers une **vue** ou une **page**
 * Saltcorn ordinaire, construite et modifiée avec le page builder.
 * Ouvrir une icône crée une fenêtre dont le contenu est chargé en
 * fragment HTML depuis /view/<nom> ou /page/<nom>, exactement comme
 * Saltcorn le fait pour ses onglets et accordéons paresseux.
 *
 * Conséquence : ajouter, modifier ou retirer une application ne
 * demande aucune ligne de code — une table, une vue, une entrée dans
 * la configuration de cette vue.
 *
 * Routes (POST /view/<nom_de_la_vue>/<route>) :
 *   pref_get / pref_set  → position des fenêtres, mémorisées par
 *                          utilisateur
 *   session_check        → la session est-elle toujours ouverte
 *   alertes              → rappels à venir, si une table d'alertes
 *                          est configurée
 */

const Table = require("@saltcorn/data/models/table");
const View = require("@saltcorn/data/models/view");
const Page = require("@saltcorn/data/models/page");
const Workflow = require("@saltcorn/data/models/workflow");
const Form = require("@saltcorn/data/models/form");
const FieldRepeat = require("@saltcorn/data/models/fieldrepeat");
const { getState } = require("@saltcorn/data/db/state");

const public_role = 10;

/** Quelques icônes proposées en tête de liste, le reste vient de Font Awesome */
const ICONES_SUGGEREES = [
  "fas fa-file-alt",
  "fas fa-calendar-alt",
  "fas fa-check-square",
  "fas fa-chart-bar",
  "fas fa-folder",
  "fas fa-address-book",
  "fas fa-cog",
  "fas fa-database",
  "fas fa-envelope",
  "fas fa-users",
];

const listeIcones = () => {
  const toutes = (getState() && getState().icons) || [];
  const reste = toutes.filter((i) => !ICONES_SUGGEREES.includes(i));
  return [...ICONES_SUGGEREES, ...reste];
};

// -----------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------
const configuration_workflow = () =>
  new Workflow({
    steps: [
      {
        name: "Système",
        form: async () => {
          return new Form({
            fields: [
              {
                name: "nom_systeme",
                label: "Nom affiché",
                sublabel: "Le libellé du bouton démarrer.",
                type: "String",
                default: "Bureau",
              },
              {
                name: "veille_minutes",
                label: "Mise en veille après (minutes)",
                sublabel: "0 pour désactiver la veille automatique.",
                type: "Integer",
                default: 10,
              },
              {
                name: "prefs_table",
                label: "Table des préférences",
                sublabel:
                  "Sert à mémoriser la position des fenêtres par utilisateur. Doit contenir les colonnes cle, valeur et une clé vers users. Laissez vide pour ne rien mémoriser.",
                type: "String",
                required: false,
                attributes: {
                  options: (await Table.find({})).map((t) => t.name),
                },
              },
              {
                name: "user_field",
                label: "Colonne propriétaire",
                sublabel:
                  "Nom de la clé vers users dans la table des préférences.",
                type: "String",
                default: "user",
              },
              {
                name: "fond",
                label: "Fond du bureau",
                type: "String",
                required: false,
                attributes: {
                  options: ["Sombre uni", "Sombre dégradé", "Quadrillage"],
                },
                default: "Sombre dégradé",
              },
            ],
          });
        },
      },

      {
        name: "Applications",
        form: async () => {
          const vues = (await View.find({})).map((v) => v.name);
          const pages = (await Page.find({})).map((p) => p.name);

          return new Form({
            fields: [
              {
                input_type: "section_header",
                label: "Icônes du bureau",
                sublabel:
                  "Chaque icône ouvre une vue ou une page Saltcorn dans une fenêtre. Créez-les normalement (Views / Pages), puis ajoutez-les ici. Aucun code n'est nécessaire.",
              },
              new FieldRepeat({
                name: "applications",
                label: "Applications",
                fields: [
                  {
                    name: "libelle",
                    label: "Nom",
                    type: "String",
                    required: true,
                  },
                  {
                    name: "icone",
                    label: "Icône",
                    type: "String",
                    required: false,
                    attributes: { options: listeIcones() },
                  },
                  {
                    name: "cible_type",
                    label: "Ouvre",
                    type: "String",
                    required: true,
                    default: "Vue",
                    attributes: { options: ["Vue", "Page", "Lien externe"] },
                  },
                  {
                    name: "vue",
                    label: "Vue",
                    type: "String",
                    required: false,
                    attributes: { options: vues },
                    showIf: { cible_type: "Vue" },
                  },
                  {
                    name: "page",
                    label: "Page",
                    type: "String",
                    required: false,
                    attributes: { options: pages },
                    showIf: { cible_type: "Page" },
                  },
                  {
                    name: "url",
                    label: "Adresse",
                    type: "String",
                    required: false,
                    showIf: { cible_type: "Lien externe" },
                  },
                  {
                    name: "etat",
                    label: "État initial",
                    sublabel:
                      "Paramètres passés à la vue, au format d'une chaîne de requête : statut=ouvert&tri=date",
                    type: "String",
                    required: false,
                    showIf: { cible_type: ["Vue", "Page"] },
                  },
                  {
                    name: "largeur",
                    label: "Largeur (px)",
                    type: "Integer",
                    default: 760,
                  },
                  {
                    name: "hauteur",
                    label: "Hauteur (px)",
                    type: "Integer",
                    default: 520,
                  },
                  {
                    name: "au_demarrage",
                    label: "Ouvrir au démarrage",
                    type: "Bool",
                  },
                ],
              }),
            ],
          });
        },
      },

      {
        name: "Alertes",
        form: async () => {
          const tables = await Table.find({});
          const champsParTable = {};
          for (const t of tables) {
            champsParTable[t.name] = (await t.getFields()).map((f) => f.name);
          }
          const tousChamps = [
            ...new Set(Object.values(champsParTable).flat()),
          ].sort();

          return new Form({
            fields: [
              {
                input_type: "section_header",
                label: "Rappels (facultatif)",
                sublabel:
                  "Le bureau peut afficher une notification à l'approche d'une échéance. Indiquez la table qui porte les dates ; laissez vide pour désactiver.",
              },
              {
                name: "alertes_table",
                label: "Table",
                type: "String",
                required: false,
                attributes: { options: tables.map((t) => t.name) },
              },
              {
                name: "alertes_champ_titre",
                label: "Colonne du titre",
                type: "String",
                required: false,
                attributes: { options: tousChamps },
              },
              {
                name: "alertes_champ_date",
                label: "Colonne de la date",
                type: "String",
                required: false,
                attributes: { options: tousChamps },
              },
              {
                name: "alertes_champ_minutes",
                label: "Colonne du délai d'alerte (minutes avant)",
                sublabel:
                  "Facultatif. Sans elle, l'alerte se déclenche à l'heure dite.",
                type: "String",
                required: false,
                attributes: { options: tousChamps },
              },
            ],
          });
        },
      },
    ],
  });

const get_state_fields = () => [];

// -----------------------------------------------------------------
// Rendu de la coquille
// -----------------------------------------------------------------
const run = async (table_id, viewname, config, state, extra) => {
  const req = extra && extra.req;
  const user = req && req.user;

  if (!user) {
    return `
<div class="bureau-login-invite">
  <h3>Session fermée</h3>
  <p>Connectez-vous pour ouvrir votre bureau.</p>
  <a class="btn btn-primary" href="/auth/login">Se connecter</a>
</div>`;
  }

  // Les applications visibles dépendent des droits sur la cible :
  // une vue que l'utilisateur n'a pas le droit de voir n'apparaît pas.
  const applications = [];
  for (const a of config.applications || []) {
    const app = {
      libelle: a.libelle,
      icone: a.icone || "fas fa-window-maximize",
      largeur: Number(a.largeur) || 760,
      hauteur: Number(a.hauteur) || 520,
      au_demarrage: !!a.au_demarrage,
    };
    const suffixe = a.etat ? `?${a.etat}` : "";

    if (a.cible_type === "Page") {
      const page = Page.findOne({ name: a.page });
      if (!page) continue;
      if (user.role_id > page.min_role) continue;
      app.id = `page-${a.page}`;
      app.url = `/page/${encodeURIComponent(a.page)}${suffixe}`;
      app.embed = a.page;
    } else if (a.cible_type === "Lien externe") {
      if (!a.url) continue;
      app.id = `lien-${a.libelle}`;
      app.url = a.url;
      app.externe = true;
    } else {
      const vue = View.findOne({ name: a.vue });
      if (!vue) continue;
      if (user.role_id > vue.min_role) continue;
      app.id = `vue-${a.vue}`;
      app.url = `/view/${encodeURIComponent(a.vue)}${suffixe}`;
      app.embed = a.vue;
    }
    applications.push(app);
  }

  const clientConfig = {
    viewname,
    nom_systeme: config.nom_systeme || "Bureau",
    veille_minutes:
      typeof config.veille_minutes === "number" ? config.veille_minutes : 10,
    fond: config.fond || "Sombre dégradé",
    memorise_positions: !!config.prefs_table,
    alertes: !!config.alertes_table,
    applications,
    utilisateur: { id: user.id, email: user.email, role_id: user.role_id },
  };

  return `
<div id="bureau-racine" class="bureau" data-config='${JSON.stringify(
    clientConfig
  ).replace(/'/g, "&apos;")}'>
  <div class="bureau-chargement">Démarrage…</div>
</div>`;
};

// -----------------------------------------------------------------
// Routes
// -----------------------------------------------------------------
const notAuth = { json: { error: "non autorisé" } };

const tablePrefs = (config) => {
  if (!config.prefs_table) return null;
  const table = Table.findOne({ name: config.prefs_table });
  if (!table) return null;
  return { table, userField: config.user_field || "user" };
};

const pref_get = async (table_id, viewname, config, body, { req }) => {
  if (!req.user) return notAuth;
  const r = tablePrefs(config);
  if (!r) return { json: { success: true, valeur: null } };
  const row = await r.table.getRow({
    cle: String(body.cle || ""),
    [r.userField]: req.user.id,
  });
  return { json: { success: true, valeur: row ? row.valeur : null } };
};

const pref_set = async (table_id, viewname, config, body, { req }) => {
  if (!req.user) return notAuth;
  const r = tablePrefs(config);
  if (!r) return { json: { success: true } };
  const cle = String(body.cle || "");
  const valeur = String(body.valeur == null ? "" : body.valeur);
  const existing = await r.table.getRow({ cle, [r.userField]: req.user.id });
  if (existing) await r.table.updateRow({ valeur }, existing.id, req.user);
  else
    await r.table.insertRow(
      { cle, valeur, [r.userField]: req.user.id },
      req.user
    );
  return { json: { success: true } };
};

const session_check = async (table_id, viewname, config, body, { req }) => ({
  json: {
    success: true,
    connecte: !!req.user,
    email: req.user ? req.user.email : null,
  },
});

/**
 * Rappels à venir. La lecture passe par les droits de la table :
 * on demande les lignes « pour cet utilisateur », donc le champ de
 * propriété ou la formule de propriété de la table s'applique.
 */
const alertes = async (table_id, viewname, config, body, { req }) => {
  if (!req.user) return notAuth;
  if (!config.alertes_table || !config.alertes_champ_date)
    return { json: { success: true, alertes: [] } };

  const table = Table.findOne({ name: config.alertes_table });
  if (!table) return { json: { success: true, alertes: [] } };
  if (req.user.role_id > table.min_role_read)
    return { json: { success: true, alertes: [] } };

  const champTitre = config.alertes_champ_titre || "titre";
  const champDate = config.alertes_champ_date;
  const champMinutes = config.alertes_champ_minutes;

  try {
    const rows = await table.getRows(
      {},
      {
        orderBy: champDate,
        limit: 400,
        forUser: req.user,
        forPublic: false,
      }
    );
    return {
      json: {
        success: true,
        alertes: rows
          .filter((r) => r[champDate])
          .map((r) => ({
            id: r.id,
            titre: r[champTitre] || "Rappel",
            date: r[champDate],
            minutes: champMinutes ? r[champMinutes] : 0,
          })),
      },
    };
  } catch (e) {
    getState().log(2, `bureau alertes: ${e.message}`);
    return { json: { success: true, alertes: [] } };
  }
};

module.exports = {
  name: "Bureau",
  description:
    "Un bureau de type système d'exploitation. Les applications sont des vues et des pages Saltcorn ordinaires, construites avec le page builder.",
  display_state_form: false,
  get_state_fields,
  configuration_workflow,
  run,
  routes: { pref_get, pref_set, session_check, alertes },
};
