/**
 * Bureau — module Saltcorn
 * -----------------------------------------------------------------
 * Fournit un view template « Bureau » : un environnement de type
 * système d'exploitation rendu dans une page Saltcorn.
 *
 * L'authentification, les rôles et la base de données restent ceux
 * de Saltcorn. Le module n'ajoute que la coquille (fenêtres, barre
 * des tâches, veille) et les applications.
 */

const version = require("./package.json").version;
const publicPath = (f) => `/plugins/public/bureau@${version}/${f}`;

module.exports = {
  sc_plugin_api_version: 1,
  plugin_name: "bureau",

  // Les feuilles de style et scripts ne sont chargés que sur les vues Bureau
  headers: [
    { css: publicPath("bureau.css"), onlyViews: ["Bureau"] },
    { script: publicPath("bureau.js"), onlyViews: ["Bureau"] },
  ],

  viewtemplates: [require("./desktop")],

  ready_for_mobile: false,
};
