/* -----------------------------------------------------------------
   Bureau — client
   Gestionnaire de fenêtres. Le contenu de chaque fenêtre est une vue
   ou une page Saltcorn ordinaire, chargée en fragment HTML.

   Le contrat de chargement est celui de Saltcorn lui-même (voir
   lazyAccHandler et reload_embedded_view dans saltcorn-common.js) :
     - requête AJAX avec les en-têtes pjaxpageload + localizedstate
     - le conteneur porte data-sc-embed-viewname et data-sc-view-source
     - initialize_page() est rappelée après injection
   Conséquence : les formulaires, les liens de vue et les rechargements
   automatiques de Saltcorn fonctionnent dans les fenêtres sans code
   supplémentaire.

   Sommaire
     1. Utilitaires et icônes de la coquille
     2. Client d'API (préférences, session, alertes)
     3. Fenêtre
     4. Bureau
     5. Amorçage
   ----------------------------------------------------------------- */
(function () {
  "use strict";

  /* ===============================================================
     1. Utilitaires
     =============================================================== */

  function el(tag, attrs, ...enfants) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === "class") n.className = v;
        else if (k === "html") n.innerHTML = v;
        else if (k === "style" && typeof v === "object") Object.assign(n.style, v);
        else if (k.startsWith("on") && typeof v === "function")
          n.addEventListener(k.slice(2).toLowerCase(), v);
        else if (v === true) n.setAttribute(k, "");
        else n.setAttribute(k, v);
      }
    }
    for (const c of enfants.flat()) {
      if (c == null || c === false) continue;
      n.appendChild(typeof c === "object" ? c : document.createTextNode(String(c)));
    }
    return n;
  }

  const svg = (d) =>
    `<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

  /* Icônes de la coquille uniquement. Les icônes d'application
     viennent de Font Awesome, choisies dans la configuration. */
  const ICONES = {
    demarrer: svg('<path d="M4 6h16M4 12h16M4 18h16"/>'),
    veille: svg(
      '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
    ),
    sortie: svg('<path d="M15 4h4v16h-4"/><path d="M11 8l-4 4 4 4"/><path d="M7 12h9"/>'),
    reduire: svg('<path d="M5 18h14"/>'),
    agrandir: svg('<rect x="5" y="5" width="14" height="14" rx="1"/>'),
    restaurer: svg('<rect x="4" y="8" width="12" height="12" rx="1"/><path d="M8 8V4h12v12h-4"/>'),
    fermer: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    actualiser: svg('<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/>'),
    fenetre: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>'),
  };

  const MOIS = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
  ];
  const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  const deuxChiffres = (n) => String(n).padStart(2, "0");
  const heureCourte = (d) => `${deuxChiffres(d.getHours())}:${deuxChiffres(d.getMinutes())}`;
  const jourSemaineLundi = (d) => (d.getDay() + 6) % 7;

  function versDate(v) {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    const d = new Date(v);
    return isNaN(d) ? null : d;
  }

  function antiRebond(fn, delai) {
    let t = null;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), delai);
    };
  }

  /**
   * Rend l'icône d'une application.
   * Accepte une classe Font Awesome ("fas fa-file-alt"), un fragment
   * SVG brut (commençant par "<"), ou rien — auquel cas une fenêtre
   * générique est dessinée.
   */
  const iconeApp = (val) => {
    if (!val) return ICONES.fenetre;
    return val.trim().startsWith("<") ? val : `<i class="${val}"></i>`;
  };

  /* ===============================================================
     2. Client d'API
     =============================================================== */

  class Api {
    constructor(viewname) {
      this.base = `/view/${encodeURIComponent(viewname)}`;
    }

    async post(route, body) {
      if (window.BUREAU_API_MOCK) return window.BUREAU_API_MOCK(route, body);

      const jeton =
        (document.querySelector("#_sc_globalCsrf") || {}).value ||
        (document.querySelector('input[name="_csrf"]') || {}).value ||
        window._sc_globalCsrf ||
        "";

      const rep = await fetch(`${this.base}/${route}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "CSRF-Token": jeton },
        body: JSON.stringify(Object.assign({ _csrf: jeton }, body)),
      });
      if (!rep.ok) throw new Error(`HTTP ${rep.status}`);
      const donnees = await rep.json();
      if (donnees.error) throw new Error(donnees.error);
      return donnees;
    }

    lirePref(cle) { return this.post("pref_get", { cle }).then((r) => r.valeur); }
    ecrirePref(cle, valeur) { return this.post("pref_set", { cle, valeur }); }
    verifierSession() { return this.post("session_check", {}); }
    lireAlertes() { return this.post("alertes", {}).then((r) => r.alertes || []); }
  }

  /**
   * Charge une vue ou une page Saltcorn en fragment, dans un conteneur.
   * Reproduit exactement le contrat de saltcorn-common.js.
   */
  function chargerFragment(conteneur, url, auSucces, auxErreurs) {
    if (window.BUREAU_FRAGMENT_MOCK) {
      Promise.resolve(window.BUREAU_FRAGMENT_MOCK(url)).then((html) => {
        conteneur.innerHTML = html;
        if (auSucces) auSucces();
      });
      return;
    }

    const entetes = { pjaxpageload: "true", localizedstate: "true" };

    const fini = (html) => {
      conteneur.innerHTML = html;
      // Rebranche les comportements Saltcorn sur le contenu injecté
      if (typeof window.initialize_page === "function") {
        try { window.initialize_page(); } catch (e) { /* non bloquant */ }
      }
      if (auSucces) auSucces();
    };

    if (window.jQuery) {
      window.jQuery.ajax(url, {
        headers: entetes,
        success: fini,
        error: (r) => auxErreurs && auxErreurs(r),
      });
      return;
    }

    fetch(url, {
      headers: Object.assign({ "X-Requested-With": "XMLHttpRequest" }, entetes),
      credentials: "same-origin",
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(fini)
      .catch((e) => auxErreurs && auxErreurs(e));
  }

  /* ===============================================================
     3. Fenêtre
     =============================================================== */

  class Fenetre {
    constructor(bureau, app) {
      this.bureau = bureau;
      this.app = app;
      this.id = app.id;
      this.titre = app.libelle;
      this.reduite = false;
      this.agrandie = false;

      const plan = bureau.plan.getBoundingClientRect();
      const l = Math.min(app.largeur || 760, plan.width - 24);
      const h = Math.min(app.hauteur || 520, plan.height - 24);
      const decalage = (bureau.fenetres.length % 6) * 28;
      const x = Math.max(12, Math.min((plan.width - l) / 2 + decalage, plan.width - l - 12));
      const y = Math.max(12, Math.min((plan.height - h) / 2 - 20 + decalage, plan.height - h - 12));

      this.el = el("div", {
        class: "br-fenetre",
        style: { left: x + "px", top: y + "px", width: l + "px", height: h + "px" },
      });

      this.titreTexte = el("div", { class: "br-titre-texte" }, this.titre);
      this.btnAgrandir = el("button", {
        class: "br-bouton-fenetre", title: "Agrandir", html: ICONES.agrandir,
      });

      const barre = el(
        "div",
        { class: "br-titre-barre" },
        el("span", { class: "br-titre-icone", html: iconeApp(app.icone) }),
        this.titreTexte,
        el(
          "div",
          { class: "br-boutons" },
          app.externe ? null : el("button", {
            class: "br-bouton-fenetre",
            title: "Actualiser",
            html: ICONES.actualiser,
            onclick: (e) => { e.stopPropagation(); this.charger(); },
          }),
          el("button", {
            class: "br-bouton-fenetre", title: "Réduire", html: ICONES.reduire,
            onclick: (e) => { e.stopPropagation(); this.reduire(); },
          }),
          this.btnAgrandir,
          el("button", {
            class: "br-bouton-fenetre br-fermer", title: "Fermer", html: ICONES.fermer,
            onclick: (e) => { e.stopPropagation(); this.fermer(); },
          })
        )
      );
      this.btnAgrandir.addEventListener("click", (e) => {
        e.stopPropagation();
        this.basculerAgrandir();
      });

      this.corps = el("div", { class: "br-corps" });
      this.poignee = el("div", { class: "br-poignee", title: "Redimensionner" });

      this.el.append(barre, this.corps, this.poignee);
      this.el.addEventListener("pointerdown", () => this.focus(), true);

      this._brancherDeplacement(barre);
      this._brancherRedimensionnement(this.poignee);
      barre.addEventListener("dblclick", () => this.basculerAgrandir());

      bureau.plan.appendChild(this.el);
      bureau.fenetres.push(this);
      bureau.majBarreTaches();
      this.focus();
      this.charger();
    }

    /* --- contenu : une vue ou une page Saltcorn ------------------ */
    charger() {
      this.corps.innerHTML = "";

      if (this.app.externe) {
        this.corps.appendChild(
          el("iframe", {
            src: this.app.url,
            style: { width: "100%", height: "100%", border: "0" },
          })
        );
        return;
      }

      // Le conteneur porte les attributs que Saltcorn utilise pour
      // recharger une vue embarquée après une action.
      const zone = el("div", {
        class: "br-embed",
        "data-sc-embed-viewname": this.app.embed || "",
        "data-sc-view-source": this.app.url,
      });
      this.corps.appendChild(zone);

      zone.innerHTML = '<div class="br-vide">Chargement…</div>';
      chargerFragment(
        zone,
        this.app.url,
        null,
        () => {
          zone.innerHTML = "";
          zone.appendChild(
            el(
              "div",
              { class: "br-vide" },
              "Contenu indisponible.",
              el("br"),
              this.app.embed || this.app.url,
              el("br"),
              el("button", {
                class: "br-btn br-btn--mini",
                style: { marginTop: "10px" },
                onclick: () => this.charger(),
              }, "Réessayer")
            )
          );
        }
      );
    }

    /* --- déplacement ------------------------------------------- */
    _brancherDeplacement(poignee) {
      let dep = null;
      poignee.addEventListener("pointerdown", (e) => {
        if (e.target.closest(".br-bouton-fenetre")) return;
        if (this.agrandie) return;
        dep = { dx: e.clientX - this.el.offsetLeft, dy: e.clientY - this.el.offsetTop };
        poignee.setPointerCapture(e.pointerId);
      });
      poignee.addEventListener("pointermove", (e) => {
        if (!dep) return;
        const plan = this.bureau.plan;
        const maxX = plan.clientWidth - this.el.offsetWidth;
        const maxY = plan.clientHeight - this.el.offsetHeight;
        this.el.style.left = Math.max(0, Math.min(e.clientX - dep.dx, maxX)) + "px";
        this.el.style.top = Math.max(0, Math.min(e.clientY - dep.dy, maxY)) + "px";
      });
      const fin = (e) => {
        if (!dep) return;
        dep = null;
        try { poignee.releasePointerCapture(e.pointerId); } catch (_) {}
        this.bureau.memoriserGeometrie(this);
      };
      poignee.addEventListener("pointerup", fin);
      poignee.addEventListener("pointercancel", fin);
    }

    /* --- redimensionnement -------------------------------------- */
    _brancherRedimensionnement(poignee) {
      let red = null;
      poignee.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        if (this.agrandie) return;
        red = { x: e.clientX, y: e.clientY, l: this.el.offsetWidth, h: this.el.offsetHeight };
        poignee.setPointerCapture(e.pointerId);
      });
      poignee.addEventListener("pointermove", (e) => {
        if (!red) return;
        const plan = this.bureau.plan;
        const maxL = plan.clientWidth - this.el.offsetLeft;
        const maxH = plan.clientHeight - this.el.offsetTop;
        this.el.style.width = Math.max(320, Math.min(red.l + e.clientX - red.x, maxL)) + "px";
        this.el.style.height = Math.max(200, Math.min(red.h + e.clientY - red.y, maxH)) + "px";
      });
      const fin = (e) => {
        if (!red) return;
        red = null;
        try { poignee.releasePointerCapture(e.pointerId); } catch (_) {}
        this.bureau.memoriserGeometrie(this);
      };
      poignee.addEventListener("pointerup", fin);
      poignee.addEventListener("pointercancel", fin);
    }

    /* --- états --------------------------------------------------- */
    focus() {
      if (this.reduite) this.restaurer();
      this.bureau.zMax += 1;
      this.el.style.zIndex = this.bureau.zMax;
      this.bureau.fenetres.forEach((f) => f.el.classList.toggle("a-le-focus", f === this));
      this.bureau.fenetreActive = this;
      this.bureau.majBarreTaches();
    }

    reduire() {
      this.reduite = true;
      this.el.classList.add("est-reduite");
      if (this.bureau.fenetreActive === this) this.bureau.fenetreActive = null;
      this.bureau.majBarreTaches();
    }

    restaurer() {
      this.reduite = false;
      this.el.classList.remove("est-reduite");
    }

    /** Agrandissement à l'échelle du bureau, pas de l'écran */
    basculerAgrandir() {
      this.agrandie = !this.agrandie;
      this.el.classList.toggle("est-agrandie", this.agrandie);
      this.btnAgrandir.innerHTML = this.agrandie ? ICONES.restaurer : ICONES.agrandir;
      this.btnAgrandir.title = this.agrandie ? "Restaurer" : "Agrandir";
      this.bureau.memoriserGeometrie(this);
    }

    fermer() {
      this.el.remove();
      this.bureau.fenetres = this.bureau.fenetres.filter((f) => f !== this);
      if (this.bureau.fenetreActive === this) this.bureau.fenetreActive = null;
      this.bureau.majBarreTaches();
    }

    geometrie() {
      return {
        x: this.el.offsetLeft, y: this.el.offsetTop,
        l: this.el.offsetWidth, h: this.el.offsetHeight,
        agrandie: this.agrandie,
      };
    }

    appliquerGeometrie(g) {
      if (!g) return;
      const plan = this.bureau.plan;
      this.el.style.left = Math.max(0, Math.min(g.x, plan.clientWidth - 120)) + "px";
      this.el.style.top = Math.max(0, Math.min(g.y, plan.clientHeight - 60)) + "px";
      this.el.style.width = Math.min(g.l, plan.clientWidth) + "px";
      this.el.style.height = Math.min(g.h, plan.clientHeight) + "px";
      if (g.agrandie) this.basculerAgrandir();
    }
  }

  /* ===============================================================
     4. Bureau
     =============================================================== */

  class Bureau {
    constructor(racine, config) {
      this.racine = racine;
      this.config = config;
      this.api = new Api(config.viewname);
      this.apps = config.applications || [];
      this.fenetres = [];
      this.fenetreActive = null;
      this.zMax = 100;
      this.geometries = {};
      this.alertesEmises = new Set();

      racine.innerHTML = "";
      racine.dataset.fond = config.fond || "Sombre dégradé";
      this._construireStructure();
      this._brancherVeille();
      this._demarrerHorloge();
      this._demarrer();
      if (config.alertes) this._surveillerAlertes();
    }

    async _demarrer() {
      if (this.config.memorise_positions) {
        try {
          const brut = await this.api.lirePref("geometries");
          if (brut) this.geometries = JSON.parse(brut);
        } catch (_) { /* première ouverture */ }
      }
      this.apps.filter((a) => a.au_demarrage).forEach((a) => this.ouvrir(a.id));
    }

    /* --- structure ---------------------------------------------- */
    _construireStructure() {
      this.plan = el("div", { class: "br-plan" });
      this.icones = el("div", { class: "br-icones" });

      if (!this.apps.length) {
        this.plan.appendChild(
          el(
            "div",
            { class: "br-aide" },
            el("strong", {}, "Aucune application configurée"),
            el("p", {},
              "Ouvrez la configuration de cette vue, onglet ",
              el("em", {}, "Applications"),
              ", et ajoutez une icône pointant vers une vue ou une page."
            )
          )
        );
      }

      for (const a of this.apps) {
        const ic = el(
          "div",
          { class: "br-icone", tabindex: "0", title: a.libelle },
          el("div", { class: "br-icone-glyphe", html: iconeApp(a.icone) }),
          el("div", { class: "br-icone-nom" }, a.libelle)
        );
        ic.addEventListener("dblclick", () => this.ouvrir(a.id));
        ic.addEventListener("click", () => {
          this.icones.querySelectorAll(".br-icone").forEach((x) => x.classList.remove("est-actif"));
          ic.classList.add("est-actif");
        });
        ic.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.ouvrir(a.id); }
        });
        this.icones.appendChild(ic);
      }
      this.plan.appendChild(this.icones);

      // Barre des tâches
      this.zoneTaches = el("div", { class: "br-taches" });
      this.horloge = el("div", { class: "br-horloge" });
      const btnDemarrer = el(
        "button",
        { class: "br-demarrer", onclick: (e) => { e.stopPropagation(); this.basculerMenu(); } },
        el("span", { html: ICONES.demarrer }),
        this.config.nom_systeme
      );
      this.barre = el(
        "div",
        { class: "br-barre" },
        btnDemarrer,
        this.zoneTaches,
        el(
          "div",
          { class: "br-zone-systeme" },
          this.horloge,
          el("button", {
            class: "br-bouton-sys", title: "Mettre en veille",
            html: ICONES.veille, onclick: () => this.verrouiller(),
          }),
          el("button", {
            class: "br-bouton-sys", title: "Se déconnecter",
            html: ICONES.sortie, onclick: () => this.deconnexion(),
          })
        )
      );

      // Menu démarrer
      this.menu = el(
        "div",
        { class: "br-menu", hidden: true },
        el(
          "div",
          { class: "br-menu-entete" },
          el("strong", {}, this.config.utilisateur.email || "Session"),
          el("span", {}, "Session ouverte")
        ),
        el(
          "div",
          { class: "br-menu-liste" },
          ...this.apps.map((a) =>
            el(
              "button",
              { class: "br-menu-item", onclick: () => { this.fermerMenu(); this.ouvrir(a.id); } },
              el("span", { html: iconeApp(a.icone) }),
              a.libelle
            )
          ),
          el("div", { class: "br-menu-separateur" }),
          el(
            "button",
            { class: "br-menu-item", onclick: () => { this.fermerMenu(); this.verrouiller(); } },
            el("span", { html: ICONES.veille }),
            "Mettre en veille"
          ),
          el(
            "button",
            { class: "br-menu-item", onclick: () => this.deconnexion() },
            el("span", { html: ICONES.sortie }),
            "Se déconnecter"
          )
        )
      );

      // Veille
      this.veilleHeure = el("div", { class: "br-veille-heure" });
      this.veilleDate = el("div", { class: "br-veille-date" });
      this.veille = el(
        "div",
        { class: "br-veille", hidden: true },
        this.veilleHeure,
        this.veilleDate,
        el("div", { class: "br-veille-user" }, this.config.utilisateur.email || ""),
        el("div", { class: "br-veille-invite" }, "Cliquez pour reprendre")
      );
      this.veille.addEventListener("click", () => this.deverrouiller());

      this.notifs = el("div", { class: "br-notifs" });

      this.racine.append(this.plan, this.barre, this.menu, this.notifs, this.veille);

      this.plan.addEventListener("pointerdown", (e) => {
        if (e.target === this.plan) {
          this.fermerMenu();
          this.icones.querySelectorAll(".br-icone").forEach((x) => x.classList.remove("est-actif"));
        }
      });
      document.addEventListener("pointerdown", (e) => {
        if (!this.menu.hidden && !this.menu.contains(e.target) && !e.target.closest(".br-demarrer"))
          this.fermerMenu();
      });
    }

    basculerMenu() { this.menu.hidden = !this.menu.hidden; }
    fermerMenu() { this.menu.hidden = true; }

    majBarreTaches() {
      this.zoneTaches.innerHTML = "";
      for (const f of this.fenetres) {
        this.zoneTaches.appendChild(
          el(
            "button",
            {
              class: "br-tache" + (f === this.fenetreActive && !f.reduite ? " a-le-focus" : ""),
              title: f.titre,
              onclick: () => {
                if (f.reduite) f.focus();
                else if (this.fenetreActive === f) f.reduire();
                else f.focus();
              },
            },
            el("span", { html: iconeApp(f.app.icone) }),
            el("span", {}, f.titre)
          )
        );
      }
    }

    ouvrir(id) {
      const app = this.apps.find((a) => a.id === id);
      if (!app) return;
      const deja = this.fenetres.find((f) => f.id === id);
      if (deja) { deja.focus(); return; }
      const f = new Fenetre(this, app);
      f.appliquerGeometrie(this.geometries[id]);
      return f;
    }

    memoriserGeometrie(f) {
      if (!this.config.memorise_positions) return;
      this.geometries[f.id] = f.geometrie();
      this._sauverGeometries();
    }

    _sauverGeometries = antiRebond(function () {
      this.api.ecrirePref("geometries", JSON.stringify(this.geometries)).catch(() => {});
    }, 700);

    _demarrerHorloge() {
      const tic = () => {
        const d = new Date();
        this.horloge.innerHTML = "";
        this.horloge.append(
          document.createTextNode(heureCourte(d)),
          el("small", {}, `${deuxChiffres(d.getDate())}/${deuxChiffres(d.getMonth() + 1)}`)
        );
        this.veilleHeure.textContent = heureCourte(d);
        this.veilleDate.textContent = `${JOURS[jourSemaineLundi(d)]}. ${d.getDate()} ${MOIS[d.getMonth()]}`;
      };
      tic();
      setInterval(tic, 10000);
    }

    _brancherVeille() {
      this.verrouille = false;
      const minutes = this.config.veille_minutes;
      if (!minutes || minutes <= 0) return;
      const delai = minutes * 60 * 1000;
      let t = null;
      const relancer = () => {
        clearTimeout(t);
        if (!this.verrouille) t = setTimeout(() => this.verrouiller(), delai);
      };
      ["pointerdown", "keydown", "wheel"].forEach((ev) =>
        this.racine.addEventListener(ev, relancer, true)
      );
      this._relancerVeille = relancer;
      relancer();
    }

    verrouiller() {
      this.verrouille = true;
      this.fermerMenu();
      this.veille.hidden = false;
    }

    async deverrouiller() {
      try {
        const r = await this.api.verifierSession();
        if (!r.connecte) { window.location.href = "/auth/login"; return; }
      } catch (_) { /* hors ligne : on laisse reprendre */ }
      this.verrouille = false;
      this.veille.hidden = true;
      if (this._relancerVeille) this._relancerVeille();
    }

    deconnexion() { window.location.href = "/auth/logout"; }

    notifier(titre, texte, duree) {
      const n = el("div", { class: "br-notif" },
        el("strong", {}, titre), el("span", {}, texte || ""));
      this.notifs.appendChild(n);
      setTimeout(() => n.remove(), duree || 9000);
    }

    async _surveillerAlertes() {
      const verifier = async () => {
        try {
          const lignes = await this.api.lireAlertes();
          const maintenant = Date.now();
          for (const a of lignes) {
            const d = versDate(a.date);
            if (!d) continue;
            const marge = Number(a.minutes) || 0;
            const ecart = d.getTime() - marge * 60000 - maintenant;
            if (ecart <= 0 && ecart > -120000 && !this.alertesEmises.has(a.id)) {
              this.alertesEmises.add(a.id);
              this.notifier(
                a.titre,
                marge > 0 ? `Dans ${marge} min — ${heureCourte(d)}` : `Maintenant — ${heureCourte(d)}`,
                14000
              );
            }
          }
        } catch (_) { /* une alerte manquée n'est pas critique */ }
      };
      verifier();
      setInterval(verifier, 60000);
    }
  }

  /* ===============================================================
     5. Amorçage
     =============================================================== */

  function demarrer() {
    const racine = document.getElementById("bureau-racine");
    if (!racine || racine.dataset.monte) return;
    racine.dataset.monte = "1";

    let config;
    try {
      config = JSON.parse(racine.getAttribute("data-config"));
    } catch (e) {
      racine.innerHTML = '<div class="br-vide">Configuration du bureau illisible.</div>';
      return;
    }

    const seul = !document.querySelector("#page-inner-content .card, .container .card");
    if (seul) racine.classList.add("bureau--plein");

    window.bureau = new Bureau(racine, config);
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", demarrer);
  else demarrer();
})();
