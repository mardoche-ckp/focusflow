/* ════════════════════════════════════════════════════════════
   app.js — FocusFlow PWA v2
   ────────────────────────────────────────────────────────────
   NOUVEAUTÉS v2 :
     ✅ Priorités  (urgent / normal / faible)
     ✅ Catégories (personnel / pro / sport / finance / formation / autre)
     ✅ Notes      (autosave 1 s)
     ✅ Export / Import JSON
     ✅ Drag & Drop des tâches (touch + mouse)
     ✅ Thème clair / sombre / auto
     ✅ Confetti à la complétion
     ✅ Tri des objectifs
     ✅ Filtre par catégorie
════════════════════════════════════════════════════════════ */

'use strict';

/* ══════════════════════════════════════════════════════════
   CONSTANTES
══════════════════════════════════════════════════════════ */
var CATEGORIES = {
  personnel: { label: '👤 Perso',     color: '#a78bfa' },
  pro:       { label: '💼 Pro',       color: '#60a5fa' },
  sport:     { label: '💪 Sport',     color: '#34d399' },
  finance:   { label: '💰 Finance',   color: '#f5a623' },
  formation: { label: '📚 Formation', color: '#fb923c' },
  autre:     { label: '🌀 Autre',     color: '#94a3b8' }
};

var PRIO_LABELS = { urgent: '🔴 Urgent', normal: '🟡 Normal', faible: '🟢 Faible' };

/* ══════════════════════════════════════════════════════════
   1. CLASSE Tache
══════════════════════════════════════════════════════════ */
class Tache {
  constructor(titre, id, faite) {
    this.id    = id != null ? id
               : 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    this.titre = titre.trim();
    this.faite = faite === true;
  }
  toJSON() { return { id: this.id, titre: this.titre, faite: this.faite }; }
  static fromJSON(d) { return new Tache(d.titre, d.id, d.faite); }
}

/* ══════════════════════════════════════════════════════════
   2. CLASSE Objectif
══════════════════════════════════════════════════════════ */
class Objectif {
  constructor(titre, dateFin, id, dateDebut, termine, taches, priorite, categorie, notes) {
    this.id        = id != null ? id
                   : 'o_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    this.titre     = titre.trim();
    this.dateFin   = dateFin;
    this.dateDebut = dateDebut != null ? dateDebut : new Date().toISOString().slice(0, 10);
    this.termine   = termine === true;
    this.taches    = Array.isArray(taches) ? taches : [];
    this.priorite  = priorite  || 'normal';   // 'urgent' | 'normal' | 'faible'
    this.categorie = categorie || 'personnel'; // clé de CATEGORIES
    this.notes     = notes     || '';
  }

  get nbFaites() {
    var n = 0;
    for (var i = 0; i < this.taches.length; i++) { if (this.taches[i].faite) n++; }
    return n;
  }
  get progression() {
    return this.taches.length === 0 ? 0 : Math.round((this.nbFaites / this.taches.length) * 100);
  }
  get indexActif() {
    for (var i = 0; i < this.taches.length; i++) { if (!this.taches[i].faite) return i; }
    return -1;
  }

  checkCompletion() {
    if (!this.termine && this.taches.length > 0 && this.nbFaites === this.taches.length) {
      this.termine = true; return true;
    }
    return false;
  }
  ajouterTache(titre) {
    var t = new Tache(titre, null, false); this.taches.push(t); return t;
  }
  supprimerTache(id) { this.taches = this.taches.filter(function(t) { return t.id !== id; }); }
  validerTache(id) {
    var found = null, idx = -1;
    for (var i = 0; i < this.taches.length; i++) {
      if (this.taches[i].id === id) { found = this.taches[i]; idx = i; break; }
    }
    if (!found)      return { ok: false, msg: 'Tâche introuvable.' };
    if (found.faite) return { ok: false, msg: 'Déjà complétée.' };
    if (idx !== this.indexActif) return { ok: false, msg: 'Terminez d\'abord la tâche précédente !' };
    found.faite = true;
    return { ok: true, msg: '' };
  }

  toJSON() {
    return {
      id: this.id, titre: this.titre, dateFin: this.dateFin,
      dateDebut: this.dateDebut, termine: this.termine,
      taches: this.taches.map(function(t) { return t.toJSON(); }),
      priorite: this.priorite, categorie: this.categorie, notes: this.notes
    };
  }
  static fromJSON(d) {
    var taches = Array.isArray(d.taches) ? d.taches.map(function(t) { return Tache.fromJSON(t); }) : [];
    return new Objectif(d.titre, d.dateFin, d.id, d.dateDebut, d.termine,
      taches, d.priorite, d.categorie, d.notes);
  }
}

/* ══════════════════════════════════════════════════════════
   3. StorageManager
══════════════════════════════════════════════════════════ */
class StorageManager {
  constructor() { this.KEY = 'focusflow_v2'; }
  save(objectifs) {
    try { localStorage.setItem(this.KEY, JSON.stringify(objectifs.map(function(o) { return o.toJSON(); }))); }
    catch(e) { console.error('[FF] save:', e); }
  }
  load() {
    try {
      var raw = localStorage.getItem(this.KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.map(function(d) { return Objectif.fromJSON(d); }) : [];
    } catch(e) { console.error('[FF] load:', e); return []; }
  }
}

/* ══════════════════════════════════════════════════════════
   4. ThemeManager
══════════════════════════════════════════════════════════ */
class ThemeManager {
  constructor() {
    this.KEY     = 'focusflow_theme';
    this.current = localStorage.getItem(this.KEY) || 'dark';
    this._mq     = window.matchMedia('(prefers-color-scheme: light)');
    this._apply();
    var self = this;
    this._mq.addEventListener('change', function() { if (self.current === 'auto') self._apply(); });
  }
  set(theme) {
    this.current = theme;
    localStorage.setItem(this.KEY, theme);
    this._apply();
  }
  _apply() {
    var resolved = this.current === 'auto'
      ? (this._mq.matches ? 'light' : 'dark')
      : this.current;
    document.documentElement.setAttribute('data-theme', resolved);
    /* Sync boutons */
    var btns = document.querySelectorAll('.theme-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].dataset.theme === this.current);
    }
  }
}

/* ══════════════════════════════════════════════════════════
   5. ConfettiManager — petits confettis canvas
══════════════════════════════════════════════════════════ */
class ConfettiManager {
  constructor() {
    this.canvas  = document.getElementById('confettiCanvas');
    this.ctx     = this.canvas ? this.canvas.getContext('2d') : null;
    this.pieces  = [];
    this.running = false;
  }
  fire() {
    if (!this.ctx) return;
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.pieces = [];
    var colors = ['#f5a623','#34d399','#60a5fa','#f87171','#a78bfa','#fb923c'];
    for (var i = 0; i < 120; i++) {
      this.pieces.push({
        x:  Math.random() * this.canvas.width,
        y:  Math.random() * -this.canvas.height,
        w:  6 + Math.random() * 8,
        h:  3 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - .5) * 4,
        vy: 2 + Math.random() * 4,
        angle: Math.random() * Math.PI * 2,
        va:    (Math.random() - .5) * .2
      });
    }
    if (!this.running) { this.running = true; this._loop(); }
  }
  _loop() {
    if (!this.ctx) return;
    var self = this;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.pieces = this.pieces.filter(function(p) { return p.y < self.canvas.height + 20; });
    this.pieces.forEach(function(p) {
      p.x += p.vx; p.y += p.vy; p.angle += p.va;
      self.ctx.save();
      self.ctx.translate(p.x, p.y);
      self.ctx.rotate(p.angle);
      self.ctx.fillStyle = p.color;
      self.ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
      self.ctx.restore();
    });
    if (this.pieces.length > 0) {
      requestAnimationFrame(function() { self._loop(); });
    } else {
      this.running = false;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
}

/* ══════════════════════════════════════════════════════════
   6. DragDropManager — touch + mouse pour réordonner les tâches
══════════════════════════════════════════════════════════ */
class DragDropManager {
  /**
   * @param {HTMLElement} list  — le <ul> des tâches
   * @param {Function}    onEnd — callback(nouvelOrdre: string[]) avec ids dans le nouvel ordre
   */
  constructor(list, onEnd) {
    this.list  = list;
    this.onEnd = onEnd;
    this.dragged   = null;
    this.draggedId = null;
    this._bind();
  }

  _bind() {
    var self = this;
    var items = this.list.querySelectorAll('.task-item:not(.task-item--done) .drag-handle');
    items.forEach(function(handle) {
      var li = handle.closest('.task-item');
      /* Mouse */
      handle.addEventListener('mousedown', function(e) { self._start(e, li); });
      /* Touch */
      handle.addEventListener('touchstart', function(e) { self._start(e, li); }, { passive: true });
    });
  }

  _start(e, li) {
    var self = this;
    this.dragged   = li;
    this.draggedId = li.dataset.tacheId;
    li.classList.add('task-item--dragging');

    var startY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;

    function onMove(ev) {
      var y = ev.type === 'touchmove' ? ev.touches[0].clientY : ev.clientY;
      var items = Array.from(self.list.querySelectorAll('.task-item:not(.task-item--dragging)'));
      items.forEach(function(item) { item.classList.remove('task-item--drag-over'); });
      var target = items.find(function(item) {
        var r = item.getBoundingClientRect();
        return y > r.top && y < r.bottom;
      });
      if (target) target.classList.add('task-item--drag-over');
    }

    function onEnd(ev) {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);

      var y = ev.type === 'touchend' ? ev.changedTouches[0].clientY : ev.clientY;
      var items = Array.from(self.list.querySelectorAll('.task-item:not(.task-item--dragging)'));
      items.forEach(function(item) { item.classList.remove('task-item--drag-over'); });

      var target = items.find(function(item) {
        var r = item.getBoundingClientRect();
        return y > r.top && y < r.bottom;
      });

      if (self.dragged) { self.dragged.classList.remove('task-item--dragging'); }

      /* Calcule le nouvel ordre */
      var allItems = Array.from(self.list.querySelectorAll('.task-item'));
      var ids = allItems.map(function(i) { return i.dataset.tacheId; });

      if (target && target.dataset.tacheId !== self.draggedId) {
        ids.splice(ids.indexOf(self.draggedId), 1);
        var targetIdx = allItems.indexOf(target);
        /* recalcule l'index dans le nouveau tableau */
        var newAllItems = Array.from(self.list.querySelectorAll('.task-item'));
        var newIds = newAllItems.map(function(i) { return i.dataset.tacheId; });
        newIds.splice(newIds.indexOf(self.draggedId), 1);
        newIds.splice(targetIdx, 0, self.draggedId);
        self.onEnd(newIds);
      }

      self.dragged   = null;
      self.draggedId = null;
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd);
  }
}

/* ══════════════════════════════════════════════════════════
   7. Router
══════════════════════════════════════════════════════════ */
class Router {
  constructor() { this.currentView = 'home'; this.detailObjId = null; }
  navigate(view, objectifId) {
    document.querySelectorAll('.view').forEach(function(v) { v.classList.remove('active'); });
    var target = document.getElementById('view-' + view);
    if (!target) return;
    target.classList.add('active');
    document.querySelectorAll('.nav-item[data-view]').forEach(function(b) {
      b.classList.toggle('active', b.dataset.view === view);
    });
    this.currentView = view;
    this.detailObjId = objectifId || null;
  }
}

/* ══════════════════════════════════════════════════════════
   8. UIManager
══════════════════════════════════════════════════════════ */
class UIManager {
  constructor(app) {
    this.app = app;
    this._toastTimer  = null;
    this._notesTimers = {}; // timers autosave par objectif id

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
      catFilters:  document.getElementById('catFilters'),
      viewDetail:  document.getElementById('view-detail'),
      bsTotal:     document.getElementById('bs-total'),
      bsDone:      document.getElementById('bs-done'),
      bsTasks:     document.getElementById('bs-tasks'),
      globalFill:  document.getElementById('globalFill'),
      globalPct:   document.getElementById('globalPct'),
      catStats:    document.getElementById('catStats'),
      recentList:  document.getElementById('recentList')
    };
  }

  /* ── Toast ── */
  toast(msg, type, dur) {
    var el = this.els.toast;
    type = type || ''; dur = dur || 2600;
    el.textContent = msg;
    el.className   = 'toast show' + (type ? ' toast--' + type : '');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(function() { el.classList.remove('show'); }, dur);
  }

  /* ── Topbar ── */
  updateTopbar(view, objId) {
    var titles = { home: 'FocusFlow', detail: 'Objectif', stats: 'Réglages & Stats' };
    this.els.topbarTitle.textContent = titles[view] || 'FocusFlow';
    this.els.topbarActs.innerHTML    = '';
    if (view !== 'detail') return;

    var self = this;

    var btnBack = this._iconBtn(
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>',
      'icon-btn icon-btn--back', 'Retour'
    );
    btnBack.addEventListener('click', function() { self.app.goHome(); });

    var btnDel = this._iconBtn(
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>',
      'icon-btn icon-btn--danger', 'Supprimer'
    );
    var cid = objId;
    btnDel.addEventListener('click', function() {
      self.app.confirmerSuppression(cid);
    });

    this.els.topbarActs.appendChild(btnBack);
    this.els.topbarActs.appendChild(btnDel);
  }

  /* ── Chips catégories ── */
  renderCatFilters(objectifs, catFiltre) {
    var self = this;
    var el   = this.els.catFilters;
    if (!el) return;
    el.innerHTML = '';

    /* Chip "Toutes" */
    var all = document.createElement('button');
    all.className   = 'chip chip--cat' + (catFiltre === 'all' ? ' active' : '');
    all.textContent = '✨ Toutes';
    all.dataset.cat = 'all';
    all.addEventListener('click', function() { self.app.setCatFiltre('all'); });
    el.appendChild(all);

    /* Chips des catégories présentes */
    Object.keys(CATEGORIES).forEach(function(key) {
      var count = objectifs.filter(function(o) { return o.categorie === key; }).length;
      if (count === 0) return;
      var btn = document.createElement('button');
      btn.className   = 'chip chip--cat' + (catFiltre === key ? ' active' : '');
      btn.textContent = CATEGORIES[key].label + ' (' + count + ')';
      btn.dataset.cat = key;
      btn.addEventListener('click', function() { self.app.setCatFiltre(key); });
      el.appendChild(btn);
    });
  }

  /* ── Vue Accueil ── */
  renderHome(objectifs, filtre, catFiltre, tri) {
    var total = objectifs.length;
    var done  = 0;
    for (var i = 0; i < objectifs.length; i++) { if (objectifs[i].termine) done++; }
    this.els.statTotal.textContent  = total;
    this.els.statActive.textContent = total - done;
    this.els.statDone.textContent   = done;

    this.renderCatFilters(objectifs, catFiltre);

    /* Filtre statut */
    var liste = objectifs.filter(function(o) {
      if (filtre === 'active') return !o.termine;
      if (filtre === 'done')   return  o.termine;
      return true;
    });

    /* Filtre catégorie */
    if (catFiltre && catFiltre !== 'all') {
      liste = liste.filter(function(o) { return o.categorie === catFiltre; });
    }

    /* Tri */
    var PRIO_ORDER = { urgent: 0, normal: 1, faible: 2 };
    liste.sort(function(a, b) {
      if (tri === 'priorite')      return (PRIO_ORDER[a.priorite] || 1) - (PRIO_ORDER[b.priorite] || 1);
      if (tri === 'date_fin')      return a.dateFin.localeCompare(b.dateFin);
      if (tri === 'progression')   return b.progression - a.progression;
      return 0; /* date_creation → ordre naturel du tableau */
    });

    this.els.list.innerHTML = '';

    /* Correction : l'état vide "Aucun objectif ici" s'affiche seulement
       si AUCUN objectif n'a jamais été créé.
       Si des objectifs existent mais ne correspondent pas au filtre,
       on affiche un message "Aucun résultat" discret à la place. */
    if (liste.length === 0) {
      if (objectifs.length === 0) {
        this.els.emptyState.hidden = false;
      } else {
        this.els.emptyState.hidden = true;
        var noMatch = document.createElement('div');
        noMatch.className = 'empty-state';
        noMatch.innerHTML =
          '<span class="empty-state__emoji">🔍</span>' +
          '<p class="empty-state__title">Aucun résultat</p>' +
          '<p class="empty-state__hint">Essayez un autre filtre ou catégorie</p>';
        this.els.list.appendChild(noMatch);
      }
      return;
    }
    this.els.emptyState.hidden = true;

    for (var j = 0; j < liste.length; j++) {
      var card = this._buildCard(liste[j]);
      card.style.animationDelay = (j * 40) + 'ms';
      this.els.list.appendChild(card);
    }
  }

  _buildCard(obj) {
    var self = this;
    var pct  = obj.progression;
    var done = obj.termine;

    var article = document.createElement('article');
    article.className    = 'obj-card' + (done ? ' obj-card--done' : '');
    article.dataset.cat  = obj.categorie;

    /* En-tête */
    var head  = document.createElement('div');
    head.className = 'obj-card__head';

    var h3 = document.createElement('h3');
    h3.className   = 'obj-card__title';
    h3.textContent = obj.titre;

    /* Badges : statut + priorité + catégorie */
    var badges = document.createElement('div');
    badges.className = 'obj-card__badges';

    /* Badge priorité (uniquement si pas terminé) */
    if (!done) {
      var bp = document.createElement('span');
      bp.className = 'badge-prio badge-prio--' + obj.priorite;
      bp.textContent = obj.priorite === 'urgent' ? '🔴' : obj.priorite === 'normal' ? '🟡' : '🟢';
      badges.appendChild(bp);
    }

    /* Badge statut */
    var bs = document.createElement('span');
    bs.className = 'badge-status ' + (done ? 'badge-status--done' : 'badge-status--active');
    var dot = document.createElement('span');
    dot.className = 'badge-dot';
    bs.appendChild(dot);
    bs.appendChild(document.createTextNode(' ' + (done ? 'Terminé' : 'En cours')));
    badges.appendChild(bs);

    head.appendChild(h3);
    head.appendChild(badges);

    /* Méta */
    var meta = document.createElement('div');
    meta.className = 'obj-card__meta';
    var mcat = document.createElement('span');
    mcat.textContent = (CATEGORIES[obj.categorie] ? CATEGORIES[obj.categorie].label : obj.categorie);
    var mdate = document.createElement('span');
    mdate.textContent = '📅 ' + this._fmt(obj.dateFin);
    var mtasks = document.createElement('span');
    mtasks.textContent = '📋 ' + obj.nbFaites + '/' + obj.taches.length;
    if (obj.notes) {
      var mnotes = document.createElement('span');
      mnotes.className   = 'obj-card__note-icon';
      mnotes.textContent = '📝';
      meta.appendChild(mnotes);
    }
    meta.appendChild(mcat);
    meta.appendChild(mdate);
    meta.appendChild(mtasks);

    /* Progression */
    var prog = document.createElement('div');
    prog.className = 'obj-card__progress';
    var row = document.createElement('div');
    row.className = 'progress-row';
    var rl = document.createElement('span'); rl.textContent = 'Progression';
    var rr = document.createElement('strong'); rr.textContent = pct + '%';
    row.appendChild(rl); row.appendChild(rr);
    var pbar = document.createElement('div'); pbar.className = 'pbar';
    var fill = document.createElement('div');
    fill.className = 'pbar__fill' + (done ? ' pbar__fill--done' : '');
    fill.style.width = pct + '%';
    pbar.appendChild(fill);
    prog.appendChild(row); prog.appendChild(pbar);

    /* Flèche */
    var arrow = document.createElement('div');
    arrow.className = 'obj-card__arrow';
    arrow.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>';

    article.appendChild(head);
    article.appendChild(meta);
    article.appendChild(prog);
    article.appendChild(arrow);

    var cid = obj.id;
    article.addEventListener('click', function() { self.app.ouvrirDetail(cid); });
    return article;
  }

  /* ── Vue Détail ── */
  renderDetail(obj) {
    var self     = this;
    var el       = this.els.viewDetail;
    var pct      = obj.progression;
    var done     = obj.termine;
    var idxActif = obj.indexActif;

    el.innerHTML = '';

    /* Hero */
    var hero = document.createElement('section');
    hero.className = 'detail-hero';

    var badgesDiv = document.createElement('div');
    badgesDiv.className = 'detail-hero__badges';
    var bstat = document.createElement('span');
    bstat.className = 'badge-status ' + (done ? 'badge-status--done' : 'badge-status--active');
    var dot = document.createElement('span'); dot.className = 'badge-dot';
    bstat.appendChild(dot);
    bstat.appendChild(document.createTextNode(' ' + (done ? 'Terminé' : 'En cours')));

    var bprio = document.createElement('span');
    bprio.className = 'badge-prio badge-prio--' + obj.priorite;
    bprio.textContent = PRIO_LABELS[obj.priorite] || obj.priorite;

    var bcat = document.createElement('span');
    bcat.className = 'badge-cat'; bcat.dataset.cat = obj.categorie;
    bcat.textContent = CATEGORIES[obj.categorie] ? CATEGORIES[obj.categorie].label : obj.categorie;

    badgesDiv.appendChild(bstat); badgesDiv.appendChild(bprio); badgesDiv.appendChild(bcat);

    var title = document.createElement('h2');
    title.className = 'detail-hero__title'; title.textContent = obj.titre;

    var dates = document.createElement('div');
    dates.className = 'detail-hero__dates';
    var d1 = document.createElement('span'); d1.textContent = '🗓 Début : ' + this._fmt(obj.dateDebut);
    var d2 = document.createElement('span'); d2.textContent = '⏳ Fin : '   + this._fmt(obj.dateFin);
    dates.appendChild(d1); dates.appendChild(d2);

    var progWrap = document.createElement('div');
    progWrap.className = 'detail-progress';
    var pt = document.createElement('div'); pt.className = 'detail-progress-top';
    var ptl = document.createElement('span'); ptl.textContent = obj.nbFaites + ' / ' + obj.taches.length + ' tâches';
    var ptr = document.createElement('strong'); ptr.textContent = pct + '%';
    pt.appendChild(ptl); pt.appendChild(ptr);
    var pbar2 = document.createElement('div'); pbar2.className = 'pbar';
    var fill2 = document.createElement('div');
    fill2.className = 'pbar__fill' + (done ? ' pbar__fill--done' : '');
    fill2.style.width = pct + '%';
    pbar2.appendChild(fill2); progWrap.appendChild(pt); progWrap.appendChild(pbar2);

    hero.appendChild(badgesDiv); hero.appendChild(title);
    hero.appendChild(dates);     hero.appendChild(progWrap);

    /* Section tâches */
    var tasksSec = document.createElement('div');
    tasksSec.className = 'tasks-section';

    var hdr = document.createElement('div'); hdr.className = 'tasks-section__header';
    var lbl = document.createElement('p');   lbl.className = 'tasks-section__label';
    lbl.textContent = '📋 Tâches (ordre séquentiel)';
    hdr.appendChild(lbl); tasksSec.appendChild(hdr);

    /* Formulaire ajout tâche */
    if (!done) {
      var addRow = document.createElement('div'); addRow.className = 'add-task-row';
      var inp = document.createElement('input');
      inp.type='text'; inp.placeholder='Ajouter une tâche…'; inp.maxLength=80; inp.autocomplete='off';
      var btnAdd = document.createElement('button');
      btnAdd.type='button'; btnAdd.className='btn-add-task'; btnAdd.setAttribute('aria-label','Ajouter');
      btnAdd.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
      var oid = obj.id;
      function doAdd() { var v=inp.value.trim(); if(v) { self.app.ajouterTache(oid,v); inp.value=''; inp.focus(); } }
      btnAdd.addEventListener('click', doAdd);
      inp.addEventListener('keydown', function(e) { if (e.key==='Enter') doAdd(); });
      addRow.appendChild(inp); addRow.appendChild(btnAdd); tasksSec.appendChild(addRow);
    }

    /* Liste tâches */
    var ul = document.createElement('ul'); ul.className = 'tasks-list';
    for (var i = 0; i < obj.taches.length; i++) {
      var tache  = obj.taches[i];
      var locked = !tache.faite && i !== idxActif;
      var li = document.createElement('li');
      li.className = 'task-item' + (tache.faite ? ' task-item--done' : '') + (locked ? ' task-item--locked' : '');
      li.dataset.tacheId = tache.id;
      li.style.animationDelay = (i * 35) + 'ms';

      /* Poignée drag (uniquement si tâche non-faite et objectif non-terminé) */
      if (!tache.faite && !done) {
        var handle = document.createElement('span');
        handle.className = 'drag-handle';
        handle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>';
        li.appendChild(handle);
      }

      var num = document.createElement('span'); num.className='task-num'; num.textContent=i+1;
      var cb  = document.createElement('input');
      cb.type='checkbox'; cb.className='task-check'; cb.checked=tache.faite;
      cb.disabled = tache.faite || locked || done;
      if (locked) cb.title='Terminez d\'abord la tâche précédente';
      (function(objectifId, tacheId, checkbox, tacheRef) {
        checkbox.addEventListener('change', function() {
          checkbox.checked = tacheRef.faite;
          self.app.validerTache(objectifId, tacheId);
        });
      }(obj.id, tache.id, cb, tache));

      var span = document.createElement('span'); span.className='task-title'; span.textContent=tache.titre;

      var btnDel = document.createElement('button');
      btnDel.type='button'; btnDel.className='btn-del-task';
      btnDel.setAttribute('aria-label','Supprimer');
      btnDel.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      (function(objectifId, tacheId) {
        btnDel.addEventListener('click', function() { self.app.supprimerTache(objectifId, tacheId); });
      }(obj.id, tache.id));

      li.appendChild(num); li.appendChild(cb); li.appendChild(span); li.appendChild(btnDel);
      ul.appendChild(li);
    }

    if (obj.taches.length === 0) {
      var hint = document.createElement('p');
      hint.style.cssText = 'font-size:.8rem;color:var(--text-3);font-style:italic;text-align:center;padding:20px 0';
      hint.textContent = 'Aucune tâche — ajoutez-en une ci-dessus.';
      ul.appendChild(hint);
    }
    tasksSec.appendChild(ul);

    /* Init Drag & Drop */
    if (!done && obj.taches.some(function(t) { return !t.faite; })) {
      var oidDnD = obj.id;
      new DragDropManager(ul, function(newIds) { self.app.reordonnerTaches(oidDnD, newIds); });
    }

    /* Bouton Marquer terminé */
    if (!done) {
      var actionsDiv = document.createElement('div'); actionsDiv.className = 'detail-actions';
      var btnDone = document.createElement('button');
      btnDone.type='button'; btnDone.className='btn-mark-done';
      btnDone.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg> Marquer comme terminé';
      var oidM = obj.id;
      btnDone.addEventListener('click', function() { self.app.marquerTermine(oidM); });
      actionsDiv.appendChild(btnDone);
      tasksSec.appendChild(actionsDiv);
    }

    /* ── Section Notes ── */
    var notesSec = document.createElement('div'); notesSec.className = 'notes-section';
    var notesLbl = document.createElement('span');
    notesLbl.className = 'notes-section__label'; notesLbl.textContent = '📝 Notes';
    var textarea = document.createElement('textarea');
    textarea.className = 'notes-textarea';
    textarea.placeholder = 'Ajoutez des notes, liens, réflexions…';
    textarea.value = obj.notes || '';
    if (done) textarea.disabled = true;
    var saveStatus = document.createElement('p'); saveStatus.className = 'notes-save-status';
    var oidN = obj.id;
    textarea.addEventListener('input', function() {
      saveStatus.textContent = '…';
      saveStatus.className   = 'notes-save-status';
      clearTimeout(self._notesTimers[oidN]);
      self._notesTimers[oidN] = setTimeout(function() {
        self.app.sauvegarderNotes(oidN, textarea.value);
        saveStatus.textContent = '✓ Sauvegardé';
        saveStatus.className   = 'notes-save-status notes-save-status--saved';
      }, 1000);
    });
    notesSec.appendChild(notesLbl); notesSec.appendChild(textarea); notesSec.appendChild(saveStatus);

    el.appendChild(hero);
    el.appendChild(tasksSec);
    el.appendChild(notesSec);
  }

  /* ── Vue Stats ── */
  renderStats(objectifs) {
    var total  = objectifs.length;
    var done   = 0;
    var tasksDone = 0;
    for (var i = 0; i < objectifs.length; i++) {
      if (objectifs[i].termine) done++;
      tasksDone += objectifs[i].nbFaites;
    }
    var pct = total > 0 ? Math.round((done / total) * 100) : 0;
    this.els.bsTotal.textContent    = total;
    this.els.bsDone.textContent     = done;
    this.els.bsTasks.textContent    = tasksDone;
    this.els.globalFill.style.width = pct + '%';
    this.els.globalPct.textContent  = pct + '%';

    /* Stats par catégorie */
    this.els.catStats.innerHTML = '';
    Object.keys(CATEGORIES).forEach(function(key) {
      var count = 0;
      for (var i = 0; i < objectifs.length; i++) { if (objectifs[i].categorie === key) count++; }
      if (count === 0) return;
      var item = document.createElement('div'); item.className = 'cat-stat-item';
      var dot  = document.createElement('span');
      dot.className = 'cat-stat-dot'; dot.style.background = CATEGORIES[key].color;
      var name = document.createElement('span'); name.className = 'cat-stat-name'; name.textContent = CATEGORIES[key].label;
      var cnt  = document.createElement('span'); cnt.className  = 'cat-stat-count'; cnt.textContent = count + ' obj.';
      var bw   = document.createElement('div');  bw.className   = 'cat-stat-bar-wrap';
      var bar  = document.createElement('div');  bar.className  = 'cat-stat-bar';
      var f    = document.createElement('div');  f.className    = 'cat-stat-fill';
      f.style.width      = Math.round((count / (total || 1)) * 100) + '%';
      f.style.background = CATEGORIES[key].color;
      bar.appendChild(f); bw.appendChild(bar);
      item.appendChild(dot); item.appendChild(name); item.appendChild(cnt); item.appendChild(bw);
      this.els.catStats.appendChild(item);
    }, this);

    /* Récents */
    this.els.recentList.innerHTML = '';
    objectifs.slice(0, 6).forEach(function(o) {
      var item = document.createElement('div'); item.className = 'recent-item';
      var rdot = document.createElement('span');
      rdot.className = 'recent-dot ' + (o.termine ? 'recent-dot--done' : 'recent-dot--active');
      var rname = document.createElement('span'); rname.className = 'recent-name'; rname.textContent = o.titre;
      var rpct  = document.createElement('span'); rpct.className  = 'recent-pct';  rpct.textContent  = o.progression + '%';
      item.appendChild(rdot); item.appendChild(rname); item.appendChild(rpct);
      this.els.recentList.appendChild(item);
    }, this);
  }

  /* ── Utilitaires ── */
  _fmt(str) {
    if (!str) return '—';
    var p = str.split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : str;
  }
  _iconBtn(svg, cls, title) {
    var btn = document.createElement('button');
    btn.type=btn.type='button'; btn.className=cls; btn.title=title; btn.innerHTML=svg; return btn;
  }
}

/* ══════════════════════════════════════════════════════════
   9. App — Chef d'orchestre
══════════════════════════════════════════════════════════ */
class App {
  constructor() {
    this.storage   = new StorageManager();
    this.router    = new Router();
    this.ui        = new UIManager(this);
    this.theme     = new ThemeManager();
    this.confetti  = new ConfettiManager();
    this.objectifs = this.storage.load();

    this.filtre    = 'all';
    this.catFiltre = 'all';
    this.tri       = 'date_creation';

    this._initGreeting();
    this._initDateMin();
    /* Masque immédiatement le bloc vide si des objectifs existent déjà */
    if (this.objectifs.length > 0) {
      var es = document.getElementById('emptyState');
      if (es) es.hidden = true;
    }
    this._bindNav();
    this._bindSheet();
    this._bindFilters();
    this._bindStats();
    this._registerSW();
    this._setupInstallBanner();
    this._hideSplash();
  }

  /* ── Init ── */
  _initGreeting() {
    var h = new Date().getHours();
    var msg = h < 12 ? 'Bonjour 🌅' : h < 18 ? 'Bon après-midi ☀️' : 'Bonsoir 🌙';
    if (this.ui.els.greet) this.ui.els.greet.textContent = msg;
  }
  _initDateMin() {
    var inp = document.getElementById('inputDateFin');
    if (inp) inp.min = new Date().toISOString().slice(0, 10);
  }
  _hideSplash() {
    var self = this, splash = document.getElementById('splash');
    if (!splash) { this.render(); return; }
    setTimeout(function() {
      splash.classList.add('hidden');
      self.render();
      setTimeout(function() { if (splash.parentNode) splash.parentNode.removeChild(splash); }, 500);
    }, 1400);
  }

  /* ── Service Worker ── */
  _registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(function() { console.log('[FF] SW ✓'); })
        .catch(function(e) { console.warn('[FF] SW:', e); });
    }
  }

  /* ── Install Banner ── */
  _setupInstallBanner() {
    var deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', function(e) {
      e.preventDefault(); deferredPrompt = e;
      var banner = document.createElement('div'); banner.className = 'install-banner';
      banner.innerHTML =
        '<span class="install-banner__icon">◈</span>' +
        '<div class="install-banner__text">' +
          '<p class="install-banner__title">Installer FocusFlow v2</p>' +
          '<p class="install-banner__sub">Accès rapide depuis l\'écran d\'accueil</p>' +
        '</div>' +
        '<div class="install-banner__btns">' +
          '<button type="button" class="btn-install" id="btnInstallPWA">Installer</button>' +
          '<button type="button" class="btn-install-close" id="btnCloseInstallPWA">✕</button>' +
        '</div>';
      document.body.appendChild(banner);
      setTimeout(function() { banner.classList.add('show'); }, 2000);
      document.getElementById('btnInstallPWA').addEventListener('click', function() {
        banner.classList.remove('show');
        if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt.userChoice.then(function() { deferredPrompt=null; }); }
      });
      document.getElementById('btnCloseInstallPWA').addEventListener('click', function() { banner.classList.remove('show'); });
    });
  }

  /* ── Événements navigation ── */
  _bindNav() {
    var self = this;
    document.querySelectorAll('.nav-item[data-view]').forEach(function(btn) {
      btn.addEventListener('click', function() { self.navigate(btn.dataset.view); });
    });
    var fab = document.getElementById('fabBtn');
    if (fab) fab.addEventListener('click', function() { self.openSheet(); });
  }

  /* ── Événements Bottom Sheet ── */
  _bindSheet() {
    var self = this;
    var overlay = document.getElementById('sheetOverlay');
    if (overlay) overlay.addEventListener('click', function() { self.closeSheet(); });

    var btnCreer = document.getElementById('btnCreer');
    if (btnCreer) btnCreer.addEventListener('click', function() { self.creerObjectif(); });

    var inputTitre = document.getElementById('inputTitre');
    if (inputTitre) inputTitre.addEventListener('keydown', function(e) { if (e.key==='Enter') self.creerObjectif(); });

    /* Priorité picker */
    document.querySelectorAll('.prio-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.prio-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    });

    /* Catégorie picker */
    document.querySelectorAll('.cat-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.cat-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    });
  }

  /* ── Événements filtres ── */
  _bindFilters() {
    var self = this;
    document.querySelectorAll('#statusFilters .chip').forEach(function(chip) {
      chip.addEventListener('click', function() {
        document.querySelectorAll('#statusFilters .chip').forEach(function(c) { c.classList.remove('active'); });
        chip.classList.add('active');
        self.filtre = chip.dataset.filter || 'all';
        self.render();
      });
    });

    var sortSel = document.getElementById('sortSelect');
    if (sortSel) sortSel.addEventListener('change', function() { self.tri = sortSel.value; self.render(); });
  }

  /* ── Événements Stats/Réglages ── */
  _bindStats() {
    var self = this;

    /* Thème */
    document.querySelectorAll('.theme-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        self.theme.set(btn.dataset.theme);
        document.querySelectorAll('.theme-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    });

    /* Export JSON */
    var btnExport = document.getElementById('btnExport');
    if (btnExport) btnExport.addEventListener('click', function() { self.exportJSON(); });

    /* Import JSON */
    var inputImport = document.getElementById('inputImport');
    if (inputImport) inputImport.addEventListener('change', function(e) {
      var file = e.target.files[0];
      if (file) self.importJSON(file);
      e.target.value = '';
    });

    /* Reset */
    var btnReset = document.getElementById('btnReset');
    if (btnReset) btnReset.addEventListener('click', function() {
      self.confirmerResetTotal();
    });
  }

  /* ── Navigation ── */
  navigate(view, objectifId) {
    this.router.navigate(view, objectifId);
    this.ui.updateTopbar(view, objectifId || null);
    this.render();
  }
  goHome()              { this.navigate('home'); }
  ouvrirDetail(oid)     { this.navigate('detail', oid); }
  setCatFiltre(cat)     { this.catFiltre = cat; this.render(); }

  /* ── Sheet ── */
  openSheet() {
    document.getElementById('bottomSheet').classList.add('open');
    document.getElementById('sheetOverlay').classList.add('open');
    setTimeout(function() { var i=document.getElementById('inputTitre'); if(i) i.focus(); }, 360);
  }
  closeSheet() {
    document.getElementById('bottomSheet').classList.remove('open');
    document.getElementById('sheetOverlay').classList.remove('open');
  }

  /* ── Créer objectif ── */
  creerObjectif() {
    var elT = document.getElementById('inputTitre');
    var elD = document.getElementById('inputDateFin');
    var titre   = elT ? elT.value.trim() : '';
    var dateFin = elD ? elD.value.trim() : '';

    if (!titre)   { this.ui.toast('⚠️ Entrez un titre', 'error'); if(elT) elT.focus(); return; }
    if (!dateFin) { this.ui.toast('⚠️ Choisissez une date limite', 'error'); if(elD) elD.focus(); return; }

    var activePrio = document.querySelector('.prio-btn.active');
    var activeCat  = document.querySelector('.cat-btn.active');
    var priorite   = activePrio ? activePrio.dataset.prio : 'normal';
    var categorie  = activeCat  ? activeCat.dataset.cat   : 'personnel';

    var obj = new Objectif(titre, dateFin, null, null, false, [], priorite, categorie, '');
    this.objectifs.unshift(obj);
    if (elT) elT.value = ''; if (elD) elD.value = '';
    this.closeSheet();
    this._saveAndRender();
    this.ui.toast('🎯 Objectif créé !', 'success');
  }

  /* ── Actions objectifs ── */
  marquerTermine(oid) {
    var obj = this._find(oid);
    if (!obj || obj.termine) return;
    obj.termine = true;
    this._saveAndRender();
    this.confetti.fire();
    this.ui.toast('🏆 Objectif terminé !', 'success', 4000);
  }
  /* ── Modal de confirmation suppression (remplace window.confirm) ── */
  confirmerSuppression(oid) {
    var self = this;
    var obj  = this._find(oid);
    if (!obj) return;

    /* Crée la modal */
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    var modal = document.createElement('div');
    modal.className = 'modal-card';
    modal.innerHTML =
      '<div class="modal-icon">🗑️</div>' +
      '<h3 class="modal-title">Supprimer l\'objectif ?</h3>' +
      '<p class="modal-msg"><strong>' + obj.titre + '</strong><br/>' +
      'Cette action supprimera aussi ses <strong>' + obj.taches.length + ' tâche(s)</strong> et ses notes.<br/>' +
      'Elle est <em>irréversible</em>.</p>' +
      '<div class="modal-actions">' +
        '<button type="button" class="modal-btn modal-btn--cancel" id="modalCancel">Annuler</button>' +
        '<button type="button" class="modal-btn modal-btn--danger" id="modalConfirm">Supprimer</button>' +
      '</div>';

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    /* Animation d'entrée */
    requestAnimationFrame(function() { overlay.classList.add('open'); });

    function close() {
      overlay.classList.remove('open');
      setTimeout(function() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 300);
    }

    document.getElementById('modalCancel').addEventListener('click', close);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
    document.getElementById('modalConfirm').addEventListener('click', function() {
      close();
      self.supprimerObjectif(oid);
    });
  }

  /* ── Modal confirmation "Tout supprimer" ── */
  confirmerResetTotal() {
    var self  = this;
    var total = this.objectifs.length;
    if (total === 0) { this.ui.toast('Aucun objectif à supprimer.'); return; }

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    var modal = document.createElement('div');
    modal.className = 'modal-card';
    modal.innerHTML =
      '<div class="modal-icon">⚠️</div>' +
      '<h3 class="modal-title">Tout supprimer ?</h3>' +
      '<p class="modal-msg">' +
        'Vous êtes sur le point de supprimer <strong>' + total + ' objectif' + (total > 1 ? 's' : '') + '</strong>' +
        ' et toutes leurs tâches.<br/><br/>' +
        '<em>Cette action est irréversible.</em>' +
      '</p>' +
      '<div class="modal-actions">' +
        '<button type="button" class="modal-btn modal-btn--cancel" id="resetCancel">Annuler</button>' +
        '<button type="button" class="modal-btn modal-btn--danger" id="resetConfirm">Tout supprimer</button>' +
      '</div>';

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    requestAnimationFrame(function() { overlay.classList.add('open'); });

    function close() {
      overlay.classList.remove('open');
      setTimeout(function() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 300);
    }

    document.getElementById('resetCancel').addEventListener('click', close);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
    document.getElementById('resetConfirm').addEventListener('click', function() {
      close();
      self.objectifs = [];
      self.storage.save(self.objectifs);
      self.render();
      self.ui.toast('🗑 Toutes les données supprimées', 'error', 3000);
    });
  }

  supprimerObjectif(oid) {
    this.objectifs = this.objectifs.filter(function(o) { return o.id !== oid; });
    this._saveAndRender(); this.goHome();
    this.ui.toast('🗑 Objectif supprimé');
  }
  sauvegarderNotes(oid, texte) {
    var obj = this._find(oid);
    if (!obj) return;
    obj.notes = texte;
    this.storage.save(this.objectifs); /* pas de re-render pour ne pas perturber le textarea */
  }

  /* ── Actions tâches ── */
  ajouterTache(oid, titre) {
    var obj = this._find(oid);
    if (!obj || obj.termine) return;
    obj.ajouterTache(titre);
    this._saveAndRender();
  }
  validerTache(oid, tacheId) {
    var obj = this._find(oid);
    if (!obj) return;
    var res = obj.validerTache(tacheId);
    if (!res.ok) { this.ui.toast('⛔ ' + res.msg, 'error'); this.render(); return; }
    var vientDeTerminer = obj.checkCompletion();
    this._saveAndRender();
    if (vientDeTerminer) { this.confetti.fire(); this.ui.toast('🏆 Objectif complété !', 'success', 4000); }
    else                 { this.ui.toast('✅ Tâche validée !', 'success'); }
  }
  supprimerTache(oid, tacheId) {
    var obj = this._find(oid);
    if (!obj) return;
    obj.supprimerTache(tacheId);
    if (obj.taches.length > 0 && obj.nbFaites < obj.taches.length) obj.termine = false;
    this._saveAndRender();
  }
  reordonnerTaches(oid, newIds) {
    var obj = this._find(oid);
    if (!obj) return;
    var map = {};
    obj.taches.forEach(function(t) { map[t.id] = t; });
    var reordered = [];
    newIds.forEach(function(id) { if (map[id]) reordered.push(map[id]); });
    /* Ajoute les tâches non présentes dans newIds (faites) dans leur ordre original */
    obj.taches.forEach(function(t) { if (reordered.indexOf(t) === -1) reordered.push(t); });
    obj.taches = reordered;
    this._saveAndRender();
    this.ui.toast('↕️ Tâches réorganisées', '', 1500);
  }

  /* ── Export / Import JSON ── */
  exportJSON() {
    var data = JSON.stringify(this.objectifs.map(function(o) { return o.toJSON(); }), null, 2);
    var blob = new Blob([data], { type: 'application/json' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href   = url;
    a.download = 'focusflow-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click();
    setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
    this.ui.toast('⬇️ Export réussi !', 'success');
  }
  importJSON(file) {
    var self   = this;
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var arr = JSON.parse(e.target.result);
        if (!Array.isArray(arr)) throw new Error('Format invalide');
        var imported = arr.map(function(d) { return Objectif.fromJSON(d); });
        if (window.confirm('Fusionner avec vos données actuelles ? (Non = Remplacer)')) {
          /* Fusion : on évite les doublons par id */
          var ids = {};
          self.objectifs.forEach(function(o) { ids[o.id] = true; });
          imported.forEach(function(o) { if (!ids[o.id]) self.objectifs.unshift(o); });
        } else {
          self.objectifs = imported;
        }
        self.storage.save(self.objectifs);
        self.render();
        self.ui.toast('⬆️ Import réussi ! (' + imported.length + ' objectifs)', 'success');
      } catch(err) {
        self.ui.toast('❌ Fichier invalide', 'error');
      }
    };
    reader.readAsText(file);
  }

  /* ── Utilitaires ── */
  _find(id) {
    for (var i = 0; i < this.objectifs.length; i++) { if (this.objectifs[i].id === id) return this.objectifs[i]; }
    return null;
  }
  _saveAndRender() { this.storage.save(this.objectifs); this.render(); }
  render() {
    var view  = this.router.currentView;
    var objId = this.router.detailObjId;
    if (view === 'home') {
      this.ui.renderHome(this.objectifs, this.filtre, this.catFiltre, this.tri);
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
   POINT D'ENTRÉE
══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function() {
  window.app = new App();
});