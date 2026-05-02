/* ════════════════════════════════════════════════════════════
   app.js — FocusFlow PWA Mobile  (version propre & corrigée)
   ────────────────────────────────────────────────────────────
   CLASSES
     Tache          → une tâche séquentielle
     Objectif       → un objectif avec liste de tâches
     StorageManager → lecture / écriture localStorage
     Router         → gestion des 3 vues (home | detail | stats)
     UIManager      → construction & mise à jour du DOM
     App            → chef d'orchestre (events + logique)

   IDs/classes HTML — tous vérifiés dans index.html :
     #splash  #toast  #topbarTitle  #topbarActions
     #view-home  #view-detail  #view-stats
     #greetMsg
     #stat-total  #stat-active  #stat-done
     #objectifsList  #emptyState
     .chip  (filtres)
     #bs-total  #bs-done  #globalFill  #globalPct  #recentList
     .nav-item[data-view]  #fabBtn
     #sheetOverlay  #bottomSheet  #btnCreer
     #inputTitre  #inputDateFin
════════════════════════════════════════════════════════════ */

'use strict';

/* ══════════════════════════════════════════════════════════
   1. CLASSE Tache
══════════════════════════════════════════════════════════ */
class Tache {
  /**
   * @param {string}  titre - Libellé de la tâche
   * @param {string}  id    - Identifiant unique (auto-généré si null)
   * @param {boolean} faite - Tâche complétée ?
   */
  constructor(titre, id, faite) {
    this.id    = id    != null ? id
               : 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    this.titre = titre.trim();
    this.faite = faite === true;
  }

  toJSON() {
    return { id: this.id, titre: this.titre, faite: this.faite };
  }

  static fromJSON(d) {
    return new Tache(d.titre, d.id, d.faite);
  }
}


/* ══════════════════════════════════════════════════════════
   2. CLASSE Objectif
══════════════════════════════════════════════════════════ */
class Objectif {
  /**
   * @param {string}   titre
   * @param {string}   dateFin   - YYYY-MM-DD
   * @param {string}   id        - auto si null
   * @param {string}   dateDebut - YYYY-MM-DD, auto si null
   * @param {boolean}  termine
   * @param {Tache[]}  taches
   */
  constructor(titre, dateFin, id, dateDebut, termine, taches) {
    this.id        = id       != null ? id
                   : 'o_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    this.titre     = titre.trim();
    this.dateFin   = dateFin;
    this.dateDebut = dateDebut != null ? dateDebut : new Date().toISOString().slice(0, 10);
    this.termine   = termine === true;
    this.taches    = Array.isArray(taches) ? taches : [];
  }

  /* Nombre de tâches cochées */
  get nbFaites() {
    var n = 0;
    for (var i = 0; i < this.taches.length; i++) {
      if (this.taches[i].faite) { n++; }
    }
    return n;
  }

  /* Progression 0-100 */
  get progression() {
    if (this.taches.length === 0) { return 0; }
    return Math.round((this.nbFaites / this.taches.length) * 100);
  }

  /* Index de la première tâche non-faite (-1 = toutes faites) */
  get indexActif() {
    for (var i = 0; i < this.taches.length; i++) {
      if (!this.taches[i].faite) { return i; }
    }
    return -1;
  }

  /**
   * Si toutes les tâches sont faites, passe termine à true.
   * @returns {boolean} true si l'objectif VIENT d'être complété
   */
  checkCompletion() {
    if (!this.termine && this.taches.length > 0 && this.nbFaites === this.taches.length) {
      this.termine = true;
      return true;
    }
    return false;
  }

  ajouterTache(titre) {
    var t = new Tache(titre, null, false);
    this.taches.push(t);
    return t;
  }

  supprimerTache(tacheId) {
    this.taches = this.taches.filter(function(t) { return t.id !== tacheId; });
  }

  /**
   * Valide la tâche (règle séquentielle stricte).
   * @param   {string} tacheId
   * @returns {{ ok: boolean, msg: string }}
   */
  validerTache(tacheId) {
    var found = null;
    var foundIdx = -1;
    for (var i = 0; i < this.taches.length; i++) {
      if (this.taches[i].id === tacheId) { found = this.taches[i]; foundIdx = i; break; }
    }
    if (!found)      { return { ok: false, msg: 'Tâche introuvable.' }; }
    if (found.faite) { return { ok: false, msg: 'Tâche déjà complétée.' }; }
    if (foundIdx !== this.indexActif) {
      return { ok: false, msg: 'Terminez d\'abord la tâche précédente !' };
    }
    found.faite = true;
    return { ok: true, msg: '' };
  }

  toJSON() {
    return {
      id: this.id, titre: this.titre, dateFin: this.dateFin,
      dateDebut: this.dateDebut, termine: this.termine,
      taches: this.taches.map(function(t) { return t.toJSON(); })
    };
  }

  static fromJSON(d) {
    var taches = Array.isArray(d.taches)
      ? d.taches.map(function(t) { return Tache.fromJSON(t); })
      : [];
    return new Objectif(d.titre, d.dateFin, d.id, d.dateDebut, d.termine, taches);
  }
}


/* ══════════════════════════════════════════════════════════
   3. StorageManager — persistance localStorage
══════════════════════════════════════════════════════════ */
class StorageManager {
  constructor() {
    this.KEY = 'focusflow_pwa_v1';
  }

  save(objectifs) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(
        objectifs.map(function(o) { return o.toJSON(); })
      ));
    } catch (e) {
      console.error('[FocusFlow] save:', e);
    }
  }

  load() {
    try {
      var raw = localStorage.getItem(this.KEY);
      if (!raw) { return []; }
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) { return []; }
      return arr.map(function(d) { return Objectif.fromJSON(d); });
    } catch (e) {
      console.error('[FocusFlow] load:', e);
      return [];
    }
  }
}


/* ══════════════════════════════════════════════════════════
   4. Router — gestion des 3 vues
══════════════════════════════════════════════════════════ */
class Router {
  constructor() {
    this.currentView = 'home'; // 'home' | 'detail' | 'stats'
    this.detailObjId = null;   // id de l'objectif affiché dans la vue detail
  }

  /**
   * Active une vue, désactive les autres.
   * @param {string} view
   * @param {string} [objectifId]
   */
  navigate(view, objectifId) {
    /* Cache toutes les vues */
    var views = document.querySelectorAll('.view');
    for (var i = 0; i < views.length; i++) {
      views[i].classList.remove('active');
    }

    /* Affiche la vue cible */
    var target = document.getElementById('view-' + view);
    if (!target) { console.warn('[Router] Vue manquante : view-' + view); return; }
    target.classList.add('active');

    /* Sync bottom-nav (hors FAB) */
    var navBtns = document.querySelectorAll('.nav-item[data-view]');
    for (var j = 0; j < navBtns.length; j++) {
      navBtns[j].classList.toggle('active', navBtns[j].dataset.view === view);
    }

    this.currentView = view;
    this.detailObjId = objectifId || null;
  }
}


/* ══════════════════════════════════════════════════════════
   5. UIManager — construction et mise à jour du DOM
══════════════════════════════════════════════════════════ */
class UIManager {
  /** @param {App} app */
  constructor(app) {
    this.app         = app;
    this._toastTimer = null;

    /* Cache des éléments DOM statiques */
    this.els = {
      toast:       document.getElementById('toast'),
      topbarTitle: document.getElementById('topbarTitle'),
      topbarActs:  document.getElementById('topbarActions'),
      greet:       document.getElementById('greetMsg'),
      statTotal:   document.getElementById('stat-total'),
      statActive:  document.getElementById('stat-active'),
      statDone:    document.getElementById('stat-done'),
      list:        document.getElementById('objectifsList'),
      emptyState:  document.getElementById('emptyState'),
      viewDetail:  document.getElementById('view-detail'),
      bsTotal:     document.getElementById('bs-total'),
      bsDone:      document.getElementById('bs-done'),
      globalFill:  document.getElementById('globalFill'),
      globalPct:   document.getElementById('globalPct'),
      recentList:  document.getElementById('recentList')
    };
  }

  /* ── Toast ─────────────────────────────────────────────── */
  /**
   * @param {string} msg
   * @param {string} [type]     'success' | 'error' | ''
   * @param {number} [duration] ms (défaut 2600)
   */
  toast(msg, type, duration) {
    var el  = this.els.toast;
    type     = type     || '';
    duration = duration || 2600;

    el.textContent = msg;
    el.className   = 'toast show' + (type ? ' toast--' + type : '');

    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(function() {
      el.classList.remove('show');
    }, duration);
  }

  /* ── Topbar contextuelle ───────────────────────────────── */
  /**
   * @param {string}      view
   * @param {string|null} objId
   */
  updateTopbar(view, objId) {
    var titles = { home: 'FocusFlow', detail: 'Objectif', stats: 'Statistiques' };
    this.els.topbarTitle.textContent = titles[view] || 'FocusFlow';
    this.els.topbarActs.innerHTML    = '';

    if (view !== 'detail') { return; }

    var self = this;

    /* Bouton Retour */
    var btnBack = this._iconBtn(
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"' +
        ' stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
      'icon-btn icon-btn--back', 'Retour'
    );
    btnBack.addEventListener('click', function() { self.app.goHome(); });

    /* Bouton Supprimer */
    var btnDel = this._iconBtn(
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"' +
        ' stroke-linecap="round" stroke-linejoin="round">' +
        '<polyline points="3 6 5 6 21 6"/>' +
        '<path d="M19 6l-1 14H6L5 6"/>' +
        '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>',
      'icon-btn icon-btn--danger', 'Supprimer cet objectif'
    );
    var capturedId = objId;
    btnDel.addEventListener('click', function() {
      if (window.confirm('Supprimer cet objectif et toutes ses tâches ?')) {
        self.app.supprimerObjectif(capturedId);
      }
    });

    this.els.topbarActs.appendChild(btnBack);
    this.els.topbarActs.appendChild(btnDel);
  }

  /* ── Vue Accueil ───────────────────────────────────────── */
  /**
   * @param {Objectif[]} objectifs - liste complète
   * @param {string}     filtre   - 'all' | 'active' | 'done'
   */
  renderHome(objectifs, filtre) {
    /* Compteurs */
    var total = objectifs.length;
    var done  = 0;
    for (var i = 0; i < objectifs.length; i++) {
      if (objectifs[i].termine) { done++; }
    }
    this.els.statTotal.textContent  = total;
    this.els.statActive.textContent = total - done;
    this.els.statDone.textContent   = done;

    /* Application du filtre */
    var liste = [];
    for (var k = 0; k < objectifs.length; k++) {
      var o = objectifs[k];
      if (filtre === 'active' && !o.termine) { liste.push(o); }
      else if (filtre === 'done'   &&  o.termine) { liste.push(o); }
      else if (filtre === 'all')                   { liste.push(o); }
    }

    /* Rendu */
    this.els.list.innerHTML = '';
    if (liste.length === 0) {
      this.els.emptyState.hidden = false;
      return;
    }
    this.els.emptyState.hidden = true;

    for (var j = 0; j < liste.length; j++) {
      var card = this._buildCard(liste[j]);
      card.style.animationDelay = (j * 45) + 'ms';
      this.els.list.appendChild(card);
    }
  }

  /** @param {Objectif} obj @returns {HTMLElement} */
  _buildCard(obj) {
    var self = this;
    var pct  = obj.progression;
    var done = obj.termine;

    var article = document.createElement('article');
    article.className = 'obj-card' + (done ? ' obj-card--done' : '');

    /* En-tête */
    var head = document.createElement('div');
    head.className = 'obj-card__head';

    var h3 = document.createElement('h3');
    h3.className   = 'obj-card__title';
    h3.textContent = obj.titre;

    var badge = document.createElement('span');
    badge.className = 'badge-status ' + (done ? 'badge-status--done' : 'badge-status--active');
    var dot = document.createElement('span');
    dot.className = 'badge-dot';
    badge.appendChild(dot);
    badge.appendChild(document.createTextNode(' ' + (done ? 'Terminé' : 'En cours')));

    head.appendChild(h3);
    head.appendChild(badge);

    /* Méta */
    var meta = document.createElement('div');
    meta.className = 'obj-card__meta';
    var s1 = document.createElement('span');
    s1.textContent = '📅 ' + this._fmt(obj.dateFin);
    var s2 = document.createElement('span');
    s2.textContent = '📋 ' + obj.nbFaites + '/' + obj.taches.length +
                     ' tâche' + (obj.taches.length !== 1 ? 's' : '');
    meta.appendChild(s1);
    meta.appendChild(s2);

    /* Barre de progression */
    var prog = document.createElement('div');
    prog.className = 'obj-card__progress';

    var row = document.createElement('div');
    row.className = 'progress-row';
    var rl = document.createElement('span');
    rl.textContent = 'Progression';
    var rr = document.createElement('strong');
    rr.textContent = pct + '%';
    row.appendChild(rl);
    row.appendChild(rr);

    var pbar = document.createElement('div');
    pbar.className = 'pbar';
    var fill = document.createElement('div');
    fill.className = 'pbar__fill' + (done ? ' pbar__fill--done' : '');
    fill.style.width = pct + '%';
    pbar.appendChild(fill);

    prog.appendChild(row);
    prog.appendChild(pbar);

    /* Flèche */
    var arrow = document.createElement('div');
    arrow.className = 'obj-card__arrow';
    arrow.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
      ' stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>';

    article.appendChild(head);
    article.appendChild(meta);
    article.appendChild(prog);
    article.appendChild(arrow);

    /* Clic → ouvre le détail */
    var cid = obj.id;
    article.addEventListener('click', function() { self.app.ouvrirDetail(cid); });

    return article;
  }

  /* ── Vue Détail ────────────────────────────────────────── */
  /** @param {Objectif} obj */
  renderDetail(obj) {
    var self     = this;
    var el       = this.els.viewDetail;
    var pct      = obj.progression;
    var done     = obj.termine;
    var idxActif = obj.indexActif;

    el.innerHTML = ''; // vide la vue avant reconstruction

    /* ── Hero ── */
    var hero = document.createElement('section');
    hero.className = 'detail-hero';

    var badgeWrap = document.createElement('div');
    badgeWrap.className = 'detail-hero__badge';
    var badge = document.createElement('span');
    badge.className = 'badge-status ' + (done ? 'badge-status--done' : 'badge-status--active');
    var dot = document.createElement('span');
    dot.className = 'badge-dot';
    badge.appendChild(dot);
    badge.appendChild(document.createTextNode(' ' + (done ? 'Terminé' : 'En cours')));
    badgeWrap.appendChild(badge);

    var title = document.createElement('h2');
    title.className   = 'detail-hero__title';
    title.textContent = obj.titre;

    var dates = document.createElement('div');
    dates.className = 'detail-hero__dates';
    var d1 = document.createElement('span');
    d1.textContent = '🗓 Début : ' + this._fmt(obj.dateDebut);
    var d2 = document.createElement('span');
    d2.textContent = '⏳ Fin : ' + this._fmt(obj.dateFin);
    dates.appendChild(d1);
    dates.appendChild(d2);

    var progWrap = document.createElement('div');
    progWrap.className = 'detail-progress';
    var progTop = document.createElement('div');
    progTop.className = 'detail-progress-top';
    var ptL = document.createElement('span');
    ptL.textContent = obj.nbFaites + ' / ' + obj.taches.length + ' tâches';
    var ptR = document.createElement('strong');
    ptR.textContent = pct + '%';
    progTop.appendChild(ptL);
    progTop.appendChild(ptR);

    var pbar = document.createElement('div');
    pbar.className = 'pbar';
    var fill = document.createElement('div');
    fill.className = 'pbar__fill' + (done ? ' pbar__fill--done' : '');
    fill.style.width = pct + '%';
    pbar.appendChild(fill);
    progWrap.appendChild(progTop);
    progWrap.appendChild(pbar);

    hero.appendChild(badgeWrap);
    hero.appendChild(title);
    hero.appendChild(dates);
    hero.appendChild(progWrap);

    /* ── Section tâches ── */
    var tasksSec = document.createElement('div');
    tasksSec.className = 'tasks-section';

    var hdr = document.createElement('div');
    hdr.className = 'tasks-section__header';
    var lbl = document.createElement('p');
    lbl.className   = 'tasks-section__label';
    lbl.textContent = '📋 Tâches (ordre séquentiel)';
    hdr.appendChild(lbl);
    tasksSec.appendChild(hdr);

    /* Formulaire ajout tâche (caché si objectif terminé) */
    if (!done) {
      var addRow = document.createElement('div');
      addRow.className = 'add-task-row';

      var inp = document.createElement('input');
      inp.type         = 'text';
      inp.placeholder  = 'Ajouter une tâche…';
      inp.maxLength    = 80;
      inp.autocomplete = 'off';

      var btnAdd = document.createElement('button');
      btnAdd.type      = 'button';
      btnAdd.className = 'btn-add-task';
      btnAdd.setAttribute('aria-label', 'Ajouter la tâche');
      btnAdd.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
        ' stroke-width="2.5" stroke-linecap="round">' +
        '<line x1="12" y1="5" x2="12" y2="19"/>' +
        '<line x1="5" y1="12" x2="19" y2="12"/></svg>';

      var oid = obj.id;
      function doAdd() {
        var v = inp.value.trim();
        if (v) { self.app.ajouterTache(oid, v); inp.value = ''; inp.focus(); }
      }
      btnAdd.addEventListener('click', doAdd);
      inp.addEventListener('keydown', function(e) { if (e.key === 'Enter') { doAdd(); } });

      addRow.appendChild(inp);
      addRow.appendChild(btnAdd);
      tasksSec.appendChild(addRow);
    }

    /* Liste des tâches */
    if (obj.taches.length > 0) {
      var ul = document.createElement('ul');
      ul.className = 'tasks-list';

      for (var i = 0; i < obj.taches.length; i++) {
        var tache  = obj.taches[i];
        var locked = !tache.faite && i !== idxActif;

        var li = document.createElement('li');
        li.className = 'task-item' +
          (tache.faite ? ' task-item--done'  : '') +
          (locked      ? ' task-item--locked' : '');
        li.style.animationDelay = (i * 35) + 'ms';

        var num = document.createElement('span');
        num.className   = 'task-num';
        num.textContent = i + 1;

        var cb = document.createElement('input');
        cb.type      = 'checkbox';
        cb.className = 'task-check';
        cb.checked   = tache.faite;
        cb.disabled  = tache.faite || locked || done;
        if (locked) { cb.title = 'Terminez d\'abord la tâche précédente'; }

        /* IIFE pour capturer les bonnes valeurs dans la closure */
        (function(objectifId, tacheId, checkbox, tacheRef) {
          checkbox.addEventListener('change', function() {
            checkbox.checked = tacheRef.faite; /* réinitialise visuellement */
            self.app.validerTache(objectifId, tacheId);
          });
        }(obj.id, tache.id, cb, tache));

        var span = document.createElement('span');
        span.className   = 'task-title';
        span.textContent = tache.titre;

        var btnDel = document.createElement('button');
        btnDel.type      = 'button';
        btnDel.className = 'btn-del-task';
        btnDel.setAttribute('aria-label', 'Supprimer cette tâche');
        btnDel.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
          ' stroke-width="2" stroke-linecap="round">' +
          '<line x1="18" y1="6" x2="6" y2="18"/>' +
          '<line x1="6" y1="6" x2="18" y2="18"/></svg>';

        (function(objectifId, tacheId) {
          btnDel.addEventListener('click', function() {
            self.app.supprimerTache(objectifId, tacheId);
          });
        }(obj.id, tache.id));

        li.appendChild(num);
        li.appendChild(cb);
        li.appendChild(span);
        li.appendChild(btnDel);
        ul.appendChild(li);
      }
      tasksSec.appendChild(ul);
    } else {
      var hint = document.createElement('p');
      hint.style.cssText = 'font-size:.8rem;color:var(--text-3);font-style:italic;' +
                           'text-align:center;padding:20px 0';
      hint.textContent   = 'Aucune tâche — ajoutez-en une ci-dessus.';
      tasksSec.appendChild(hint);
    }

    /* Bouton "Marquer terminé" (masqué si déjà terminé) */
    if (!done) {
      var actionsDiv = document.createElement('div');
      actionsDiv.className = 'detail-actions';

      var btnDone = document.createElement('button');
      btnDone.type      = 'button';
      btnDone.className = 'btn-mark-done';
      btnDone.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
          ' stroke-width="2.5" stroke-linecap="round">' +
          '<circle cx="12" cy="12" r="10"/>' +
          '<polyline points="9 12 11 14 15 10"/></svg>' +
        ' Marquer comme terminé';

      var oidDone = obj.id;
      btnDone.addEventListener('click', function() { self.app.marquerTermine(oidDone); });
      actionsDiv.appendChild(btnDone);
      tasksSec.appendChild(actionsDiv);
    }

    el.appendChild(hero);
    el.appendChild(tasksSec);
  }

  /* ── Vue Stats ─────────────────────────────────────────── */
  /** @param {Objectif[]} objectifs */
  renderStats(objectifs) {
    var total = objectifs.length;
    var done  = 0;
    for (var i = 0; i < objectifs.length; i++) {
      if (objectifs[i].termine) { done++; }
    }
    var pct = total > 0 ? Math.round((done / total) * 100) : 0;

    this.els.bsTotal.textContent    = total;
    this.els.bsDone.textContent     = done;
    this.els.globalFill.style.width = pct + '%';
    this.els.globalPct.textContent  = pct + '%';

    this.els.recentList.innerHTML = '';
    var slice = objectifs.slice(0, 6);
    for (var j = 0; j < slice.length; j++) {
      var o    = slice[j];
      var item = document.createElement('div');
      item.className = 'recent-item';

      var rdot = document.createElement('span');
      rdot.className = 'recent-dot ' + (o.termine ? 'recent-dot--done' : 'recent-dot--active');

      var rname = document.createElement('span');
      rname.className   = 'recent-name';
      rname.textContent = o.titre;

      var rpct = document.createElement('span');
      rpct.className   = 'recent-pct';
      rpct.textContent = o.progression + '%';

      item.appendChild(rdot);
      item.appendChild(rname);
      item.appendChild(rpct);
      this.els.recentList.appendChild(item);
    }
  }

  /* ── Utilitaires privés ────────────────────────────────── */

  /** YYYY-MM-DD → JJ/MM/AAAA */
  _fmt(str) {
    if (!str) { return '—'; }
    var p = str.split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : str;
  }

  /** Crée un bouton icône pour la topbar */
  _iconBtn(svgHtml, className, title) {
    var btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = className;
    btn.title     = title;
    btn.innerHTML = svgHtml;
    return btn;
  }
}


/* ══════════════════════════════════════════════════════════
   6. App — Chef d'orchestre
══════════════════════════════════════════════════════════ */
class App {
  constructor() {
    this.storage   = new StorageManager();
    this.router    = new Router();
    this.ui        = new UIManager(this);
    this.objectifs = this.storage.load();
    this.filtre    = 'all'; // filtre actif sur la vue Accueil

    this._initGreeting();
    this._initDateMin();
    this._bindNav();
    this._bindSheet();
    this._bindFilters();
    this._registerServiceWorker();
    this._setupInstallBanner();
    this._hideSplash();   /* lance aussi le premier render */
  }

  /* ── Initialisation ──────────────────────────────────── */

  _initGreeting() {
    var h   = new Date().getHours();
    var msg = h < 12 ? 'Bonjour 🌅' : h < 18 ? 'Bon après-midi ☀️' : 'Bonsoir 🌙';
    var el  = this.ui.els.greet;
    if (el) { el.textContent = msg; }
  }

  _initDateMin() {
    var inp = document.getElementById('inputDateFin');
    if (inp) { inp.min = new Date().toISOString().slice(0, 10); }
  }

  /** Cache le splash après 1.3 s, puis lance le premier render */
  _hideSplash() {
    var self   = this;
    var splash = document.getElementById('splash');
    if (!splash) { this.render(); return; }

    setTimeout(function() {
      splash.classList.add('hidden');
      self.render();
      /* Retire l'élément du DOM après la transition CSS (400 ms) */
      setTimeout(function() {
        if (splash.parentNode) { splash.parentNode.removeChild(splash); }
      }, 500);
    }, 1300);
  }

  /* ── Service Worker ──────────────────────────────────── */
  _registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(function()    { console.log('[FocusFlow] SW enregistré ✓'); })
        .catch(function(e)  { console.warn('[FocusFlow] SW erreur :', e); });
    }
  }

  /* ── Bannière d'installation PWA ─────────────────────── */
  _setupInstallBanner() {
    var deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', function(e) {
      e.preventDefault();
      deferredPrompt = e;

      /* Crée la bannière avec les classes CSS définies dans style.css */
      var banner = document.createElement('div');
      banner.className = 'install-banner';
      banner.innerHTML =
        '<span class="install-banner__icon">◈</span>' +
        '<div class="install-banner__text">' +
          '<p class="install-banner__title">Installer FocusFlow</p>' +
          '<p class="install-banner__sub">Accès rapide depuis votre écran d\'accueil</p>' +
        '</div>' +
        '<div class="install-banner__btns">' +
          '<button type="button" class="btn-install" id="btnInstallPWA">Installer</button>' +
          '<button type="button" class="btn-install-close" id="btnCloseInstallPWA">✕</button>' +
        '</div>';
      document.body.appendChild(banner);

      /* Affiche la bannière après 2 s */
      setTimeout(function() { banner.classList.add('show'); }, 2000);

      document.getElementById('btnInstallPWA').addEventListener('click', function() {
        banner.classList.remove('show');
        if (deferredPrompt) {
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then(function() { deferredPrompt = null; });
        }
      });

      document.getElementById('btnCloseInstallPWA').addEventListener('click', function() {
        banner.classList.remove('show');
      });
    });
  }

  /* ── Événements — Bottom Navigation ──────────────────── */
  _bindNav() {
    var self = this;

    /* Boutons nav avec data-view */
    var navBtns = document.querySelectorAll('.nav-item[data-view]');
    for (var i = 0; i < navBtns.length; i++) {
      (function(btn) {
        btn.addEventListener('click', function() { self.navigate(btn.dataset.view); });
      }(navBtns[i]));
    }

    /* FAB → ouvre le bottom sheet */
    var fab = document.getElementById('fabBtn');
    if (fab) {
      fab.addEventListener('click', function() { self.openSheet(); });
    }
  }

  /* ── Événements — Bottom Sheet ───────────────────────── */
  _bindSheet() {
    var self = this;

    /* Ferme en cliquant sur l'overlay */
    var overlay = document.getElementById('sheetOverlay');
    if (overlay) {
      overlay.addEventListener('click', function() { self.closeSheet(); });
    }

    /* Bouton "Créer l'objectif" */
    var btnCreer = document.getElementById('btnCreer');
    if (btnCreer) {
      btnCreer.addEventListener('click', function() { self.creerObjectif(); });
    }

    /* Entrée dans le champ titre */
    var inputTitre = document.getElementById('inputTitre');
    if (inputTitre) {
      inputTitre.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { self.creerObjectif(); }
      });
    }
  }

  /* ── Événements — Chips de filtre ────────────────────── */
  _bindFilters() {
    var self  = this;
    var chips = document.querySelectorAll('.chip');
    for (var i = 0; i < chips.length; i++) {
      (function(chip) {
        chip.addEventListener('click', function() {
          /* Désactive tous les chips */
          var all = document.querySelectorAll('.chip');
          for (var j = 0; j < all.length; j++) { all[j].classList.remove('active'); }
          chip.classList.add('active');
          self.filtre = chip.dataset.filter || 'all';
          self.render();
        });
      }(chips[i]));
    }
  }

  /* ── Navigation ──────────────────────────────────────── */

  navigate(view, objectifId) {
    this.router.navigate(view, objectifId);
    this.ui.updateTopbar(view, objectifId || null);
    this.render();
  }

  goHome() { this.navigate('home'); }

  ouvrirDetail(objectifId) { this.navigate('detail', objectifId); }

  /* ── Bottom Sheet ────────────────────────────────────── */

  openSheet() {
    var sheet   = document.getElementById('bottomSheet');
    var overlay = document.getElementById('sheetOverlay');
    if (sheet)   { sheet.classList.add('open'); }
    if (overlay) { overlay.classList.add('open'); }
    setTimeout(function() {
      var inp = document.getElementById('inputTitre');
      if (inp) { inp.focus(); }
    }, 360);
  }

  closeSheet() {
    var sheet   = document.getElementById('bottomSheet');
    var overlay = document.getElementById('sheetOverlay');
    if (sheet)   { sheet.classList.remove('open'); }
    if (overlay) { overlay.classList.remove('open'); }
  }

  /* ── Actions — Objectifs ─────────────────────────────── */

  creerObjectif() {
    var elTitre   = document.getElementById('inputTitre');
    var elDateFin = document.getElementById('inputDateFin');
    var titre     = elTitre   ? elTitre.value.trim()   : '';
    var dateFin   = elDateFin ? elDateFin.value.trim() : '';

    if (!titre) {
      this.ui.toast('⚠️ Entrez un titre', 'error');
      if (elTitre) { elTitre.focus(); }
      return;
    }
    if (!dateFin) {
      this.ui.toast('⚠️ Choisissez une date limite', 'error');
      if (elDateFin) { elDateFin.focus(); }
      return;
    }

    var obj = new Objectif(titre, dateFin, null, null, false, []);
    this.objectifs.unshift(obj);    /* plus récent en tête */

    if (elTitre)   { elTitre.value   = ''; }
    if (elDateFin) { elDateFin.value = ''; }

    this.closeSheet();
    this._saveAndRender();
    this.ui.toast('🎯 Objectif créé !', 'success');
  }

  marquerTermine(objectifId) {
    var obj = this._find(objectifId);
    if (!obj || obj.termine) { return; }
    obj.termine = true;
    this._saveAndRender();
    this.ui.toast('🏆 Objectif terminé !', 'success', 3500);
  }

  supprimerObjectif(objectifId) {
    this.objectifs = this.objectifs.filter(function(o) { return o.id !== objectifId; });
    this._saveAndRender();
    this.goHome();
    this.ui.toast('🗑 Objectif supprimé');
  }

  /* ── Actions — Tâches ────────────────────────────────── */

  ajouterTache(objectifId, titre) {
    var obj = this._find(objectifId);
    if (!obj || obj.termine) { return; }
    obj.ajouterTache(titre);
    this._saveAndRender();
  }

  validerTache(objectifId, tacheId) {
    var obj = this._find(objectifId);
    if (!obj) { return; }

    var res = obj.validerTache(tacheId);
    if (!res.ok) {
      this.ui.toast('⛔ ' + res.msg, 'error');
      this.render(); /* re-render pour corriger l'état de la checkbox */
      return;
    }

    var vientDeTerminer = obj.checkCompletion();
    this._saveAndRender();

    if (vientDeTerminer) {
      this.ui.toast('🏆 Félicitations ! Objectif complété !', 'success', 4000);
    } else {
      this.ui.toast('✅ Tâche validée !', 'success');
    }
  }

  supprimerTache(objectifId, tacheId) {
    var obj = this._find(objectifId);
    if (!obj) { return; }
    obj.supprimerTache(tacheId);
    /* Si l'objectif était marqué terminé mais que des tâches restent non-faites */
    if (obj.taches.length > 0 && obj.nbFaites < obj.taches.length) {
      obj.termine = false;
    }
    this._saveAndRender();
  }

  /* ── Utilitaires internes ────────────────────────────── */

  _find(id) {
    for (var i = 0; i < this.objectifs.length; i++) {
      if (this.objectifs[i].id === id) { return this.objectifs[i]; }
    }
    return null;
  }

  _saveAndRender() {
    this.storage.save(this.objectifs);
    this.render();
  }

  /** Dispatch vers la bonne méthode de rendu selon la vue courante */
  render() {
    var view  = this.router.currentView;
    var objId = this.router.detailObjId;

    if (view === 'home') {
      this.ui.renderHome(this.objectifs, this.filtre);

    } else if (view === 'detail') {
      var obj = this._find(objId);
      if (!obj) { this.goHome(); return; }
      this.ui.renderDetail(obj);

    } else if (view === 'stats') {
      this.ui.renderStats(this.objectifs);
    }
  }
}


/* ══════════════════════════════════════════════════════════
   7. POINT D'ENTRÉE
══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function() {
  window.app = new App();
});
