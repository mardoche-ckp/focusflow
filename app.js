/* ════════════════════════════════════════════════════════════
   app.js — FocusFlow v3  (Phase 2)
   ────────────────────────────────────────────────────────────
   NOUVEAUTÉS v3 :
     🔥 StreakManager    → série de jours actifs, mini-calendrier
     ⏰ DeadlineManager  → alertes J-1/J-3, liste stats, notifs push
   + Tout ce qui existait en v2 (priorités, catégories, notes,
     export/import, drag&drop, thèmes, confetti, modals)
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
var JOURS_SEMAINE = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];

/* ══════════════════════════════════════════════════════════
   UTILITAIRES DATE
══════════════════════════════════════════════════════════ */
function dateToKey(d) {
  /* Retourne "YYYY-MM-DD" pour une date JS */
  return d.toISOString().slice(0, 10);
}
function today() { return dateToKey(new Date()); }
function diffJours(dateStr) {
  /* Nombre de jours entre aujourd'hui et dateStr (positif = dans le futur) */
  var t  = new Date(today());
  var d  = new Date(dateStr);
  return Math.round((d - t) / 86400000);
}

/* ══════════════════════════════════════════════════════════
   1. CLASSE Tache
══════════════════════════════════════════════════════════ */
class Tache {
  constructor(titre, id, faite) {
    this.id    = id != null ? id : 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6);
    this.titre = titre.trim();
    this.faite = faite === true;
  }
  toJSON() { return { id:this.id, titre:this.titre, faite:this.faite }; }
  static fromJSON(d) { return new Tache(d.titre, d.id, d.faite); }
}

/* ══════════════════════════════════════════════════════════
   2. CLASSE Objectif
══════════════════════════════════════════════════════════ */
class Objectif {
  constructor(titre, dateFin, id, dateDebut, termine, taches, priorite, categorie, notes) {
    this.id        = id != null ? id : 'o_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6);
    this.titre     = titre.trim();
    this.dateFin   = dateFin;
    this.dateDebut = dateDebut != null ? dateDebut : today();
    this.termine   = termine === true;
    this.taches    = Array.isArray(taches) ? taches : [];
    this.priorite  = priorite  || 'normal';
    this.categorie = categorie || 'personnel';
    this.notes     = notes     || '';
  }
  get nbFaites() { return this.taches.filter(function(t){return t.faite;}).length; }
  get progression() { return this.taches.length===0?0:Math.round((this.nbFaites/this.taches.length)*100); }
  get indexActif() { for(var i=0;i<this.taches.length;i++){if(!this.taches[i].faite)return i;} return -1; }
  checkCompletion() {
    if (!this.termine && this.taches.length>0 && this.nbFaites===this.taches.length) { this.termine=true; return true; }
    return false;
  }
  ajouterTache(titre) { var t=new Tache(titre,null,false); this.taches.push(t); return t; }
  supprimerTache(id)  { this.taches=this.taches.filter(function(t){return t.id!==id;}); }
  validerTache(id) {
    var found=null,idx=-1;
    for(var i=0;i<this.taches.length;i++){if(this.taches[i].id===id){found=this.taches[i];idx=i;break;}}
    if(!found)      return {ok:false,msg:'Tâche introuvable.'};
    if(found.faite) return {ok:false,msg:'Déjà complétée.'};
    if(idx!==this.indexActif) return {ok:false,msg:'Terminez d\'abord la tâche précédente !'};
    found.faite=true; return {ok:true,msg:''};
  }
  toJSON() {
    return {id:this.id,titre:this.titre,dateFin:this.dateFin,dateDebut:this.dateDebut,
      termine:this.termine,taches:this.taches.map(function(t){return t.toJSON();}),
      priorite:this.priorite,categorie:this.categorie,notes:this.notes};
  }
  static fromJSON(d) {
    var taches=Array.isArray(d.taches)?d.taches.map(function(t){return Tache.fromJSON(t);}):[];
    return new Objectif(d.titre,d.dateFin,d.id,d.dateDebut,d.termine,taches,d.priorite,d.categorie,d.notes);
  }
}

/* ══════════════════════════════════════════════════════════
   3. StorageManager
══════════════════════════════════════════════════════════ */
class StorageManager {
  constructor() { this.KEY='focusflow_v2'; this.ACTIVITY_KEY='focusflow_activity'; }
  save(objectifs) {
    try { localStorage.setItem(this.KEY, JSON.stringify(objectifs.map(function(o){return o.toJSON();}))); }
    catch(e){console.error('[FF]save:',e);}
  }
  load() {
    try {
      var raw=localStorage.getItem(this.KEY);
      if(!raw)return[];
      var arr=JSON.parse(raw);
      return Array.isArray(arr)?arr.map(function(d){return Objectif.fromJSON(d);}):[];
    } catch(e){return[];}
  }
  /* Journal d'activité : { "YYYY-MM-DD": { tasks: N, objectives: N } } */
  getActivity() {
    try { var r=localStorage.getItem(this.ACTIVITY_KEY); return r?JSON.parse(r):{}; }
    catch(e){return{};}
  }
  saveActivity(activity) {
    try { localStorage.setItem(this.ACTIVITY_KEY, JSON.stringify(activity)); }
    catch(e){}
  }
  recordActivity(type) {
    /* type: 'task' | 'objective' */
    var act  = this.getActivity();
    var key  = today();
    if (!act[key]) act[key] = {tasks:0,objectives:0};
    if (type==='task')      act[key].tasks++;
    if (type==='objective') act[key].objectives++;
    this.saveActivity(act);
  }
}

/* ══════════════════════════════════════════════════════════
   4. ThemeManager
══════════════════════════════════════════════════════════ */
class ThemeManager {
  constructor() {
    this.KEY='focusflow_theme';
    this.current=localStorage.getItem(this.KEY)||'dark';
    this._mq=window.matchMedia('(prefers-color-scheme: light)');
    this._apply();
    var self=this;
    this._mq.addEventListener('change',function(){if(self.current==='auto')self._apply();});
  }
  set(theme) { this.current=theme; localStorage.setItem(this.KEY,theme); this._apply(); }
  _apply() {
    var resolved=this.current==='auto'?(this._mq.matches?'light':'dark'):this.current;
    document.documentElement.setAttribute('data-theme',resolved);
    document.querySelectorAll('.theme-btn').forEach(function(b){
      b.classList.toggle('active',b.dataset.theme===this.current);
    },this);
  }
}

/* ══════════════════════════════════════════════════════════
   5. ConfettiManager
══════════════════════════════════════════════════════════ */
class ConfettiManager {
  constructor() {
    this.canvas=document.getElementById('confettiCanvas');
    this.ctx=this.canvas?this.canvas.getContext('2d'):null;
    this.pieces=[]; this.running=false;
  }
  fire() {
    if(!this.ctx)return;
    this.canvas.width=window.innerWidth; this.canvas.height=window.innerHeight;
    this.pieces=[];
    var colors=['#f5a623','#34d399','#60a5fa','#f87171','#a78bfa','#fb923c'];
    for(var i=0;i<120;i++){
      this.pieces.push({
        x:Math.random()*this.canvas.width, y:Math.random()*-this.canvas.height,
        w:6+Math.random()*8, h:3+Math.random()*5,
        color:colors[Math.floor(Math.random()*colors.length)],
        vx:(Math.random()-.5)*4, vy:2+Math.random()*4,
        angle:Math.random()*Math.PI*2, va:(Math.random()-.5)*.2
      });
    }
    if(!this.running){this.running=true;this._loop();}
  }
  _loop() {
    if(!this.ctx)return;
    var self=this;
    this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
    this.pieces=this.pieces.filter(function(p){return p.y<self.canvas.height+20;});
    this.pieces.forEach(function(p){
      p.x+=p.vx;p.y+=p.vy;p.angle+=p.va;
      self.ctx.save();self.ctx.translate(p.x,p.y);self.ctx.rotate(p.angle);
      self.ctx.fillStyle=p.color;self.ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h);self.ctx.restore();
    });
    if(this.pieces.length>0){requestAnimationFrame(function(){self._loop();});}
    else{this.running=false;this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);}
  }
}

/* ══════════════════════════════════════════════════════════
   6. 🔥 StreakManager
   Calcule la série de jours consécutifs où l'utilisateur
   a validé au moins une tâche ou terminé un objectif.
══════════════════════════════════════════════════════════ */
class StreakManager {
  constructor(storage) {
    this.storage = storage;
    this.BEST_KEY = 'focusflow_best_streak';
  }

  /* Calcule la série actuelle à partir du journal d'activité */
  getCurrent() {
    var activity = this.storage.getActivity();
    var streak   = 0;
    var d        = new Date();

    /* On vérifie aujourd'hui et les jours précédents en remontant */
    while (true) {
      var key = dateToKey(d);
      var day = activity[key];
      if (day && (day.tasks > 0 || day.objectives > 0)) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else {
        /* Si aujourd'hui n'est pas encore actif, on vérifie hier */
        if (key === today() && streak === 0) {
          d.setDate(d.getDate() - 1);
          var yesterdayKey = dateToKey(d);
          var yesterday = activity[yesterdayKey];
          if (yesterday && (yesterday.tasks > 0 || yesterday.objectives > 0)) {
            /* La série continue depuis hier */
            continue;
          }
        }
        break;
      }
    }
    return streak;
  }

  /* Meilleure série jamais atteinte */
  getBest() {
    var current = this.getCurrent();
    var stored  = parseInt(localStorage.getItem(this.BEST_KEY) || '0', 10);
    var best    = Math.max(current, stored);
    localStorage.setItem(this.BEST_KEY, best);
    return best;
  }

  /* Données des 7 derniers jours pour le mini-calendrier */
  getWeek() {
    var activity = this.storage.getActivity();
    var days     = [];
    for (var i = 6; i >= 0; i--) {
      var d   = new Date();
      d.setDate(d.getDate() - i);
      var key = dateToKey(d);
      var act = activity[key];
      days.push({
        key:    key,
        label:  JOURS_SEMAINE[d.getDay()],
        active: !!(act && (act.tasks > 0 || act.objectives > 0)),
        isToday: key === today()
      });
    }
    return days;
  }
}

/* ══════════════════════════════════════════════════════════
   7. ⏰ DeadlineManager
   Détecte les objectifs dont la date limite approche.
══════════════════════════════════════════════════════════ */
class DeadlineManager {
  /**
   * @param {Objectif[]} objectifs
   * @returns {{ urgent: Objectif[], warning: Objectif[], ok: Objectif[] }}
   */
  getDeadlines(objectifs) {
    var result = { urgent: [], warning: [], ok: [] };
    objectifs.forEach(function(o) {
      if (o.termine) return; /* ignore les objectifs terminés */
      var diff = diffJours(o.dateFin);
      if      (diff < 0)  result.urgent.push(o);  /* dépassé */
      else if (diff <= 1) result.urgent.push(o);  /* J-0 ou J-1 */
      else if (diff <= 3) result.warning.push(o); /* J-2 à J-3 */
      else                result.ok.push(o);
    });
    return result;
  }

  /* Label humain selon le nombre de jours */
  getLabel(objectif) {
    var diff = diffJours(objectif.dateFin);
    if (diff < 0)  return 'Dépassé de ' + Math.abs(diff) + ' jour' + (Math.abs(diff)>1?'s':'') + ' !';
    if (diff === 0) return 'Aujourd\'hui !';
    if (diff === 1) return 'Demain !';
    return 'Dans ' + diff + ' jours';
  }

  /* Icône selon l'urgence */
  getIcon(objectif) {
    var diff = diffJours(objectif.dateFin);
    if (diff < 0)  return '🚨';
    if (diff <= 1) return '⏰';
    if (diff <= 3) return '⚠️';
    return '📅';
  }

  /* Classe CSS selon l'urgence */
  getClass(objectif) {
    var diff = diffJours(objectif.dateFin);
    if (diff <= 1) return 'urgent';
    if (diff <= 3) return 'warning';
    return 'ok';
  }

  /* Envoie une notification push (si autorisée) */
  async requestPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied')  return false;
    var result = await Notification.requestPermission();
    return result === 'granted';
  }

  sendNotification(title, body, icon) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    new Notification(title, {
      body: body,
      icon: icon || './icons/icon-192.svg',
      badge: './icons/icon-192.svg',
      vibrate: [200, 100, 200]
    });
  }

  /* Vérifie et envoie les alertes deadline du jour */
  checkAndNotify(objectifs) {
    var self = this;
    var dl   = this.getDeadlines(objectifs);
    var alerted = false;

    dl.urgent.forEach(function(o) {
      var diff = diffJours(o.dateFin);
      if (diff <= 0) {
        self.sendNotification(
          '🚨 Deadline dépassée !',
          '"' + o.titre + '" devait être terminé le ' + o.dateFin,
          './icons/icon-192.svg'
        );
        alerted = true;
      } else {
        self.sendNotification(
          '⏰ Deadline demain !',
          '"' + o.titre + '" doit être terminé demain.',
          './icons/icon-192.svg'
        );
        alerted = true;
      }
    });

    dl.warning.forEach(function(o) {
      var diff = diffJours(o.dateFin);
      self.sendNotification(
        '⚠️ Deadline dans ' + diff + ' jours',
        '"' + o.titre + '" doit être terminé le ' + o.dateFin,
        './icons/icon-192.svg'
      );
      alerted = true;
    });

    return alerted;
  }
}

/* ══════════════════════════════════════════════════════════
   9. DragDropManager
══════════════════════════════════════════════════════════ */
class DragDropManager {
  constructor(list, onEnd) {
    this.list=list; this.onEnd=onEnd;
    this.dragged=null; this.draggedId=null;
    this._bind();
  }
  _bind() {
    var self=this;
    var handles=this.list.querySelectorAll('.task-item:not(.task-item--done) .drag-handle');
    handles.forEach(function(h){
      var li=h.closest('.task-item');
      h.addEventListener('mousedown',function(e){self._start(e,li);});
      h.addEventListener('touchstart',function(e){self._start(e,li);},{passive:true});
    });
  }
  _start(e,li) {
    var self=this;
    this.dragged=li; this.draggedId=li.dataset.tacheId;
    li.classList.add('task-item--dragging');
    function onMove(ev){
      var y=ev.type==='touchmove'?ev.touches[0].clientY:ev.clientY;
      var items=Array.from(self.list.querySelectorAll('.task-item:not(.task-item--dragging)'));
      items.forEach(function(i){i.classList.remove('task-item--drag-over');});
      var t=items.find(function(i){var r=i.getBoundingClientRect();return y>r.top&&y<r.bottom;});
      if(t)t.classList.add('task-item--drag-over');
    }
    function onEnd(ev){
      document.removeEventListener('mousemove',onMove);document.removeEventListener('mouseup',onEnd);
      document.removeEventListener('touchmove',onMove);document.removeEventListener('touchend',onEnd);
      var y=ev.type==='touchend'?ev.changedTouches[0].clientY:ev.clientY;
      var items=Array.from(self.list.querySelectorAll('.task-item:not(.task-item--dragging)'));
      items.forEach(function(i){i.classList.remove('task-item--drag-over');});
      if(self.dragged)self.dragged.classList.remove('task-item--dragging');
      var allItems=Array.from(self.list.querySelectorAll('.task-item'));
      var target=items.find(function(i){var r=i.getBoundingClientRect();return y>r.top&&y<r.bottom;});
      if(target&&target.dataset.tacheId!==self.draggedId){
        var newIds=allItems.map(function(i){return i.dataset.tacheId;});
        newIds.splice(newIds.indexOf(self.draggedId),1);
        newIds.splice(allItems.indexOf(target),0,self.draggedId);
        self.onEnd(newIds);
      }
      self.dragged=null; self.draggedId=null;
    }
    document.addEventListener('mousemove',onMove);document.addEventListener('mouseup',onEnd);
    document.addEventListener('touchmove',onMove,{passive:true});document.addEventListener('touchend',onEnd);
  }
}

/* ══════════════════════════════════════════════════════════
   10. Router
══════════════════════════════════════════════════════════ */
class Router {
  constructor(){this.currentView='home';this.detailObjId=null;}
  navigate(view,objectifId){
    document.querySelectorAll('.view').forEach(function(v){v.classList.remove('active');});
    var t=document.getElementById('view-'+view);
    if(!t)return;
    t.classList.add('active');
    document.querySelectorAll('.nav-item[data-view]').forEach(function(b){
      b.classList.toggle('active',b.dataset.view===view);
    });
    this.currentView=view; this.detailObjId=objectifId||null;
  }
}

/* ══════════════════════════════════════════════════════════
   11. UIManager
══════════════════════════════════════════════════════════ */
class UIManager {
  constructor(app){
    this.app=app;
    this._toastTimer=null;
    this._notesTimers={};
    this.els={
      toast:        document.getElementById('toast'),
      topbarTitle:  document.getElementById('topbarTitle'),
      topbarActs:   document.getElementById('topbarActions'),
      streakBadge:  document.getElementById('streakBadge'),
      streakCount:  document.getElementById('streakCount'),
      streakDays:   document.getElementById('streakDays'),
      streakSub:    document.getElementById('streakSub'),
      streakCard:   document.getElementById('streakCard'),
      streakWeek:   document.getElementById('streakWeek'),
      streakStatDays:document.getElementById('streakStatDays'),
      streakBest:   document.getElementById('streakBest'),
      deadlineAlerts:document.getElementById('deadlineAlerts'),
      deadlineList: document.getElementById('deadlineList'),
      greet:        document.getElementById('greetMsg'),
      statTotal:    document.getElementById('stat-total'),
      statActive:   document.getElementById('stat-active'),
      statDone:     document.getElementById('stat-done'),
      list:         document.getElementById('objectifsList'),
      emptyState:   document.getElementById('emptyState'),
      catFilters:   document.getElementById('catFilters'),
      viewDetail:   document.getElementById('view-detail'),
      bsTotal:      document.getElementById('bs-total'),
      bsDone:       document.getElementById('bs-done'),
      bsTasks:      document.getElementById('bs-tasks'),
      globalFill:   document.getElementById('globalFill'),
      globalPct:    document.getElementById('globalPct'),
      catStats:     document.getElementById('catStats'),
      recentList:   document.getElementById('recentList'),
      notifStatus:  document.getElementById('notifStatus'),
      toggleNotif:  document.getElementById('toggleNotif')
    };
  }

  /* ── Toast ── */
  toast(msg,type,dur){
    var el=this.els.toast; type=type||''; dur=dur||2600;
    el.textContent=msg;
    el.className='toast show'+(type?' toast--'+type:'');
    clearTimeout(this._toastTimer);
    this._toastTimer=setTimeout(function(){el.classList.remove('show');},dur);
  }

  /* ── Topbar ── */
  updateTopbar(view,objId){
    var titles={home:'FocusFlow',detail:'Objectif',stats:'Statistiques',settings:'Réglages'};
    this.els.topbarTitle.textContent=titles[view]||'FocusFlow';
    /* Streak badge visible uniquement sur l'accueil */
    if(this.els.streakBadge){
      this.els.streakBadge.hidden=(view!=='home');
    }
    /* Vide les actions contextuelles (boutons back/delete) */
    var acts=this.els.topbarActs;
    /* Supprime tout sauf le streakBadge */
    Array.from(acts.children).forEach(function(c){
      if(c.id!=='streakBadge') acts.removeChild(c);
    });
    if(view!=='detail')return;
    var self=this;
    var btnBack=this._iconBtn(
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>',
      'icon-btn icon-btn--back','Retour'
    );
    btnBack.addEventListener('click',function(){self.app.goHome();});
    var btnDel=this._iconBtn(
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>',
      'icon-btn icon-btn--danger','Supprimer'
    );
    var cid=objId;
    btnDel.addEventListener('click',function(){self.app.confirmerSuppression(cid);});
    acts.insertBefore(btnBack,acts.firstChild);
    acts.insertBefore(btnDel,acts.firstChild);
  }

  /* ── 🔥 Streak UI ── */
  renderStreak(streak, best, week) {
    var s = streak.current;
    /* Badge topbar */
    if (this.els.streakCount) this.els.streakCount.textContent = s;
    if (this.els.streakBadge) this.els.streakBadge.hidden = (s === 0);

    /* Carte accueil */
    if (this.els.streakDays)  this.els.streakDays.textContent = s;
    if (this.els.streakSub) {
      this.els.streakSub.textContent = s === 0
        ? 'Complétez une tâche aujourd\'hui !'
        : s === 1
          ? 'C\'est parti ! Continuez demain 💪'
          : 'Incroyable ! ' + s + ' jours de suite 🔥';
    }

    /* Page stats */
    if (this.els.streakStatDays) this.els.streakStatDays.textContent = s;
    if (this.els.streakBest)     this.els.streakBest.textContent = 'Meilleure série : ' + best + ' jour' + (best>1?'s':'');

    /* Mini calendrier 7 jours */
    if (this.els.streakWeek) {
      this.els.streakWeek.innerHTML = '';
      week.forEach(function(day) {
        var col = document.createElement('div'); col.className = 'streak-day';
        var dot = document.createElement('div');
        dot.className = 'streak-day__dot'
          + (day.active  ? ' streak-day__dot--active' : '')
          + (day.isToday ? ' streak-day__dot--today'  : '');
        dot.textContent = day.active ? '✓' : '';
        var lbl = document.createElement('span'); lbl.className='streak-day__label'; lbl.textContent=day.label;
        col.appendChild(dot); col.appendChild(lbl);
        this.els.streakWeek.appendChild(col);
      }, this);
    }
  }

  /* ── ⏰ Alertes deadline (accueil) ── */
  renderDeadlineAlerts(objectifs, dlManager) {
    var self = this;
    var el   = this.els.deadlineAlerts;
    if (!el) return;
    el.innerHTML = '';
    var dl = dlManager.getDeadlines(objectifs);
    var toShow = dl.urgent.concat(dl.warning).slice(0, 3);
    toShow.forEach(function(obj) {
      var cls   = dlManager.getClass(obj);
      var icon  = dlManager.getIcon(obj);
      var label = dlManager.getLabel(obj);
      var div = document.createElement('div');
      div.className = 'deadline-alert deadline-alert--' + cls;
      div.innerHTML =
        '<span class="deadline-alert__icon">' + icon + '</span>' +
        '<div class="deadline-alert__body">' +
          '<p class="deadline-alert__title">' + obj.titre + '</p>' +
          '<p class="deadline-alert__days">' + label + '</p>' +
        '</div>' +
        '<span class="deadline-alert__arrow">›</span>';
      var oid = obj.id;
      div.addEventListener('click', function() { self.app.ouvrirDetail(oid); });
      el.appendChild(div);
    });
  }

  /* ── ⏰ Liste deadline (stats) ── */
  renderDeadlineList(objectifs, dlManager) {
    var self = this;
    var el   = this.els.deadlineList;
    if (!el) return;
    el.innerHTML = '';
    var actifs = objectifs.filter(function(o){return !o.termine;})
                          .sort(function(a,b){return a.dateFin.localeCompare(b.dateFin);})
                          .slice(0, 8);
    if (actifs.length === 0) {
      el.innerHTML = '<p style="font-size:.8rem;color:var(--text-3);font-style:italic;padding:12px 0">Aucun objectif en cours.</p>';
      return;
    }
    actifs.forEach(function(obj) {
      var cls   = dlManager.getClass(obj);
      var icon  = dlManager.getIcon(obj);
      var label = dlManager.getLabel(obj);
      var item = document.createElement('div');
      item.className = 'deadline-item deadline-item--' + cls;
      var iconEl  = document.createElement('span'); iconEl.className='deadline-item__icon'; iconEl.textContent=icon;
      var nameEl  = document.createElement('span'); nameEl.className='deadline-item__name'; nameEl.textContent=obj.titre;
      var badgeEl = document.createElement('span'); badgeEl.className='deadline-item__badge'; badgeEl.textContent=label;
      item.appendChild(iconEl); item.appendChild(nameEl); item.appendChild(badgeEl);
      var oid=obj.id;
      item.addEventListener('click',function(){self.app.ouvrirDetail(oid);});
      el.appendChild(item);
    });
  }

  /* ── Chips catégories ── */
  renderCatFilters(objectifs, catFiltre) {
    var self=this;
    var el=this.els.catFilters;
    if(!el)return;
    el.innerHTML='';
    var all=document.createElement('button');
    all.className='chip chip--cat'+(catFiltre==='all'?' active':'');
    all.textContent='✨ Toutes'; all.dataset.cat='all';
    all.addEventListener('click',function(){self.app.setCatFiltre('all');});
    el.appendChild(all);
    Object.keys(CATEGORIES).forEach(function(key){
      var count=objectifs.filter(function(o){return o.categorie===key;}).length;
      if(!count)return;
      var btn=document.createElement('button');
      btn.className='chip chip--cat'+(catFiltre===key?' active':'');
      btn.textContent=CATEGORIES[key].label+' ('+count+')';
      btn.dataset.cat=key;
      btn.addEventListener('click',function(){self.app.setCatFiltre(key);});
      el.appendChild(btn);
    });
  }

  /* ── Vue Accueil ── */
  renderHome(objectifs, filtre, catFiltre, tri, streakData, dlManager) {
    var total=objectifs.length, done=0;
    for(var i=0;i<objectifs.length;i++){if(objectifs[i].termine)done++;}
    this.els.statTotal.textContent=total;
    this.els.statActive.textContent=total-done;
    this.els.statDone.textContent=done;
    this.renderCatFilters(objectifs,catFiltre);
    this.renderStreak(streakData.streak, streakData.best, streakData.week);
    this.renderDeadlineAlerts(objectifs, dlManager);

    var liste=objectifs.filter(function(o){
      if(filtre==='active')return !o.termine;
      if(filtre==='done')  return  o.termine;
      return true;
    });
    if(catFiltre&&catFiltre!=='all') liste=liste.filter(function(o){return o.categorie===catFiltre;});
    var PO={urgent:0,normal:1,faible:2};
    liste.sort(function(a,b){
      if(tri==='priorite')    return (PO[a.priorite]||1)-(PO[b.priorite]||1);
      if(tri==='date_fin')    return a.dateFin.localeCompare(b.dateFin);
      if(tri==='progression') return b.progression-a.progression;
      return 0;
    });
    this.els.list.innerHTML='';
    if(liste.length===0){
      if(objectifs.length===0){this.els.emptyState.hidden=false;}
      else{
        this.els.emptyState.hidden=true;
        var nm=document.createElement('div'); nm.className='empty-state';
        nm.innerHTML='<span class="empty-state__emoji">🔍</span><p class="empty-state__title">Aucun résultat</p><p class="empty-state__hint">Essayez un autre filtre</p>';
        this.els.list.appendChild(nm);
      }
      return;
    }
    this.els.emptyState.hidden=true;
    for(var j=0;j<liste.length;j++){
      var card=this._buildCard(liste[j]);
      card.style.animationDelay=(j*40)+'ms';
      this.els.list.appendChild(card);
    }
  }

  _buildCard(obj){
    var self=this; var pct=obj.progression; var done=obj.termine;
    var article=document.createElement('article');
    article.className='obj-card'+(done?' obj-card--done':'');
    article.dataset.cat=obj.categorie;
    var head=document.createElement('div'); head.className='obj-card__head';
    var h3=document.createElement('h3'); h3.className='obj-card__title'; h3.textContent=obj.titre;
    var badges=document.createElement('div'); badges.className='obj-card__badges';
    if(!done){
      var bp=document.createElement('span'); bp.className='badge-prio badge-prio--'+obj.priorite;
      bp.textContent=obj.priorite==='urgent'?'🔴':obj.priorite==='normal'?'🟡':'🟢'; badges.appendChild(bp);
    }
    /* Badge deadline urgente sur la carte */
    if(!done){
      var diff=diffJours(obj.dateFin);
      if(diff<=1){
        var bd=document.createElement('span'); bd.className='badge-prio badge-prio--urgent';
        bd.textContent=diff<0?'🚨 Dépassé':diff===0?'⏰ Aujourd\'hui':'⏰ Demain'; badges.appendChild(bd);
      }
    }
    var bs=document.createElement('span');
    bs.className='badge-status '+(done?'badge-status--done':'badge-status--active');
    var dot=document.createElement('span'); dot.className='badge-dot'; bs.appendChild(dot);
    bs.appendChild(document.createTextNode(' '+(done?'Terminé':'En cours')));
    badges.appendChild(bs); head.appendChild(h3); head.appendChild(badges);
    var meta=document.createElement('div'); meta.className='obj-card__meta';
    var mcat=document.createElement('span'); mcat.textContent=(CATEGORIES[obj.categorie]?CATEGORIES[obj.categorie].label:obj.categorie);
    var mdate=document.createElement('span'); mdate.textContent='📅 '+this._fmt(obj.dateFin);
    var mtasks=document.createElement('span'); mtasks.textContent='📋 '+obj.nbFaites+'/'+obj.taches.length;
    if(obj.notes){var mn=document.createElement('span');mn.className='obj-card__note-icon';mn.textContent='📝';meta.appendChild(mn);}
    meta.appendChild(mcat);meta.appendChild(mdate);meta.appendChild(mtasks);
    var prog=document.createElement('div'); prog.className='obj-card__progress';
    var row=document.createElement('div'); row.className='progress-row';
    var rl=document.createElement('span'); rl.textContent='Progression';
    var rr=document.createElement('strong'); rr.textContent=pct+'%';
    row.appendChild(rl);row.appendChild(rr);
    var pbar=document.createElement('div'); pbar.className='pbar';
    var fill=document.createElement('div'); fill.className='pbar__fill'+(done?' pbar__fill--done':''); fill.style.width=pct+'%';
    pbar.appendChild(fill); prog.appendChild(row); prog.appendChild(pbar);
    var arrow=document.createElement('div'); arrow.className='obj-card__arrow';
    arrow.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>';
    article.appendChild(head);article.appendChild(meta);article.appendChild(prog);article.appendChild(arrow);
    var cid=obj.id;
    article.addEventListener('click',function(){self.app.ouvrirDetail(cid);});
    return article;
  }

  /* ── Vue Détail ── */
  renderDetail(obj){
    var self=this; var el=this.els.viewDetail;
    var pct=obj.progression; var done=obj.termine; var idxActif=obj.indexActif;
    el.innerHTML='';
    /* Hero */
    var hero=document.createElement('section'); hero.className='detail-hero';
    var bdiv=document.createElement('div'); bdiv.className='detail-hero__badges';
    var bst=document.createElement('span'); bst.className='badge-status '+(done?'badge-status--done':'badge-status--active');
    var dot=document.createElement('span'); dot.className='badge-dot'; bst.appendChild(dot);
    bst.appendChild(document.createTextNode(' '+(done?'Terminé':'En cours')));
    var bpr=document.createElement('span'); bpr.className='badge-prio badge-prio--'+obj.priorite; bpr.textContent=PRIO_LABELS[obj.priorite]||obj.priorite;
    var bcat=document.createElement('span'); bcat.className='badge-cat'; bcat.dataset.cat=obj.categorie;
    bcat.textContent=CATEGORIES[obj.categorie]?CATEGORIES[obj.categorie].label:obj.categorie;
    /* Badge deadline */
    if(!done){
      var diff=diffJours(obj.dateFin);
      if(diff<=3){
        var bdl=document.createElement('span'); bdl.className='badge-prio badge-prio--'+(diff<=1?'urgent':'normal');
        var dlm=this.app.deadlineManager;
        bdl.textContent=dlm.getIcon(obj)+' '+dlm.getLabel(obj); bdiv.appendChild(bdl);
      }
    }
    bdiv.appendChild(bst);bdiv.appendChild(bpr);bdiv.appendChild(bcat);
    var title=document.createElement('h2'); title.className='detail-hero__title'; title.textContent=obj.titre;
    var dates=document.createElement('div'); dates.className='detail-hero__dates';
    var d1=document.createElement('span');d1.textContent='🗓 Début : '+this._fmt(obj.dateDebut);
    var d2=document.createElement('span');d2.textContent='⏳ Fin : '+this._fmt(obj.dateFin);
    dates.appendChild(d1);dates.appendChild(d2);
    var pw=document.createElement('div'); pw.className='detail-progress';
    var pt=document.createElement('div'); pt.className='detail-progress-top';
    var ptl=document.createElement('span');ptl.textContent=obj.nbFaites+' / '+obj.taches.length+' tâches';
    var ptr=document.createElement('strong');ptr.textContent=pct+'%';
    pt.appendChild(ptl);pt.appendChild(ptr);
    var pb=document.createElement('div');pb.className='pbar';
    var pf=document.createElement('div');pf.className='pbar__fill'+(done?' pbar__fill--done':'');pf.style.width=pct+'%';
    pb.appendChild(pf);pw.appendChild(pt);pw.appendChild(pb);
    hero.appendChild(bdiv);hero.appendChild(title);hero.appendChild(dates);hero.appendChild(pw);
    /* Tâches */
    var ts=document.createElement('div');ts.className='tasks-section';
    var hdr=document.createElement('div');hdr.className='tasks-section__header';
    var lbl=document.createElement('p');lbl.className='tasks-section__label';lbl.textContent='📋 Tâches (ordre séquentiel)';
    hdr.appendChild(lbl);ts.appendChild(hdr);
    if(!done){
      var ar=document.createElement('div');ar.className='add-task-row';
      var inp=document.createElement('input');inp.type='text';inp.placeholder='Ajouter une tâche…';inp.maxLength=80;inp.autocomplete='off';
      var ba=document.createElement('button');ba.type='button';ba.className='btn-add-task';
      ba.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
      var oid=obj.id;
      function doAdd(){var v=inp.value.trim();if(v){self.app.ajouterTache(oid,v);inp.value='';inp.focus();}}
      ba.addEventListener('click',doAdd);inp.addEventListener('keydown',function(e){if(e.key==='Enter')doAdd();});
      ar.appendChild(inp);ar.appendChild(ba);ts.appendChild(ar);
    }
    var ul=document.createElement('ul');ul.className='tasks-list';
    for(var i=0;i<obj.taches.length;i++){
      var tache=obj.taches[i]; var locked=!tache.faite&&i!==idxActif;
      var li=document.createElement('li');
      li.className='task-item'+(tache.faite?' task-item--done':'')+(locked?' task-item--locked':'');
      li.dataset.tacheId=tache.id; li.style.animationDelay=(i*35)+'ms';
      if(!tache.faite&&!done){
        var handle=document.createElement('span');handle.className='drag-handle';
        handle.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>';
        li.appendChild(handle);
      }
      var num=document.createElement('span');num.className='task-num';num.textContent=i+1;
      var cb=document.createElement('input');cb.type='checkbox';cb.className='task-check';cb.checked=tache.faite;cb.disabled=tache.faite||locked||done;
      (function(oId,tId,checkbox,tRef){
        checkbox.addEventListener('change',function(){checkbox.checked=tRef.faite;self.app.validerTache(oId,tId);});
      }(obj.id,tache.id,cb,tache));
      var sp=document.createElement('span');sp.className='task-title';sp.textContent=tache.titre;
      var bd=document.createElement('button');bd.type='button';bd.className='btn-del-task';
      bd.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      (function(oId,tId){bd.addEventListener('click',function(){self.app.supprimerTache(oId,tId);});}(obj.id,tache.id));
      li.appendChild(num);li.appendChild(cb);li.appendChild(sp);li.appendChild(bd);ul.appendChild(li);
    }
    if(!obj.taches.length){
      var hint=document.createElement('p');hint.style.cssText='font-size:.8rem;color:var(--text-3);font-style:italic;text-align:center;padding:20px 0';
      hint.textContent='Aucune tâche — ajoutez-en une ci-dessus.';ul.appendChild(hint);
    }
    ts.appendChild(ul);
    if(!done&&obj.taches.some(function(t){return !t.faite;})){
      var oidD=obj.id;
      new DragDropManager(ul,function(nIds){self.app.reordonnerTaches(oidD,nIds);});
    }
    if(!done){
      var ad=document.createElement('div');ad.className='detail-actions';
      var bmd=document.createElement('button');bmd.type='button';bmd.className='btn-mark-done';
      bmd.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg> Marquer comme terminé';
      var oidM=obj.id;bmd.addEventListener('click',function(){self.app.marquerTermine(oidM);});
      ad.appendChild(bmd);ts.appendChild(ad);
    }
    /* Notes */
    var ns=document.createElement('div');ns.className='notes-section';
    var nl=document.createElement('span');nl.className='notes-section__label';nl.textContent='📝 Notes';
    var ta=document.createElement('textarea');ta.className='notes-textarea';ta.placeholder='Ajoutez des notes, liens, réflexions…';ta.value=obj.notes||'';if(done)ta.disabled=true;
    var ss=document.createElement('p');ss.className='notes-save-status';
    var oidN=obj.id;
    ta.addEventListener('input',function(){
      ss.textContent='…';ss.className='notes-save-status';
      clearTimeout(self._notesTimers[oidN]);
      self._notesTimers[oidN]=setTimeout(function(){self.app.sauvegarderNotes(oidN,ta.value);ss.textContent='✓ Sauvegardé';ss.className='notes-save-status notes-save-status--saved';},1000);
    });
    ns.appendChild(nl);ns.appendChild(ta);ns.appendChild(ss);
    el.appendChild(hero);el.appendChild(ts);el.appendChild(ns);
  }

  /* ── Vue Stats ── */
  renderStats(objectifs, streakData, dlManager){
    var total=objectifs.length,done=0,tasksDone=0;
    for(var i=0;i<objectifs.length;i++){if(objectifs[i].termine)done++;tasksDone+=objectifs[i].nbFaites;}
    var pct=total>0?Math.round((done/total)*100):0;
    this.els.bsTotal.textContent=total;this.els.bsDone.textContent=done;
    this.els.bsTasks.textContent=tasksDone;
    this.els.globalFill.style.width=pct+'%';this.els.globalPct.textContent=pct+'%';
    this.renderStreak(streakData.streak,streakData.best,streakData.week);
    this.renderDeadlineList(objectifs,dlManager);
    /* Stats catégories */
    this.els.catStats.innerHTML='';
    Object.keys(CATEGORIES).forEach(function(key){
      var count=objectifs.filter(function(o){return o.categorie===key;}).length;
      if(!count)return;
      var item=document.createElement('div');item.className='cat-stat-item';
      var dot=document.createElement('span');dot.className='cat-stat-dot';dot.style.background=CATEGORIES[key].color;
      var name=document.createElement('span');name.className='cat-stat-name';name.textContent=CATEGORIES[key].label;
      var cnt=document.createElement('span');cnt.className='cat-stat-count';cnt.textContent=count+' obj.';
      var bw=document.createElement('div');bw.className='cat-stat-bar-wrap';
      var bar=document.createElement('div');bar.className='cat-stat-bar';
      var f=document.createElement('div');f.className='cat-stat-fill';
      f.style.width=Math.round((count/(total||1))*100)+'%';f.style.background=CATEGORIES[key].color;
      bar.appendChild(f);bw.appendChild(bar);
      item.appendChild(dot);item.appendChild(name);item.appendChild(cnt);item.appendChild(bw);
      this.els.catStats.appendChild(item);
    },this);
    /* Récents */
    this.els.recentList.innerHTML='';
    objectifs.slice(0,6).forEach(function(o){
      var item=document.createElement('div');item.className='recent-item';
      var rd=document.createElement('span');rd.className='recent-dot '+(o.termine?'recent-dot--done':'recent-dot--active');
      var rn=document.createElement('span');rn.className='recent-name';rn.textContent=o.titre;
      var rp=document.createElement('span');rp.className='recent-pct';rp.textContent=o.progression+'%';
      item.appendChild(rd);item.appendChild(rn);item.appendChild(rp);
      this.els.recentList.appendChild(item);
    },this);

  }

  /* ── Notifications toggle UI ── */
  updateNotifUI(enabled){
    var btn=this.els.toggleNotif;
    var lbl=this.els.notifStatus;
    if(!btn)return;
    btn.classList.toggle('on',enabled);
    if(lbl) lbl.textContent = enabled ? '✅ Alertes deadline activées' : 'Notifications désactivées';
  }

  /* ── Utilitaires ── */
  _fmt(s){if(!s)return'—';var p=s.split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:s;}
  _iconBtn(svg,cls,title){var b=document.createElement('button');b.type='button';b.className=cls;b.title=title;b.innerHTML=svg;return b;}
}

/* ══════════════════════════════════════════════════════════
   12. App — Chef d'orchestre
══════════════════════════════════════════════════════════ */
class App {
  constructor(){
    this.storage        = new StorageManager();
    this.router         = new Router();
    this.ui             = new UIManager(this);
    this.theme          = new ThemeManager();
    this.confetti       = new ConfettiManager();
    this.streakManager  = new StreakManager(this.storage);
    this.deadlineManager= new DeadlineManager();

    this.objectifs      = this.storage.load();
    this.filtre         = 'all';
    this.catFiltre      = 'all';
    this.tri            = 'date_creation';
    this.notifEnabled   = localStorage.getItem('focusflow_notif')==='true';

    if(this.objectifs.length>0){var es=document.getElementById('emptyState');if(es)es.hidden=true;}

    this._initGreeting();
    this._initDateMin();
    this._bindNav();
    this._bindSheet();
    this._bindFilters();
    this._bindStats();
    this._registerSW();
    this._setupInstallBanner();
    /* Vérifie les deadlines au démarrage */
    if(this.notifEnabled) this._checkDeadlines();
    this._hideSplash();
  }

  /* ── Données streak centralisées ── */
  _getStreakData(){
    return {
      streak: {current: this.streakManager.getCurrent()},
      best:   this.streakManager.getBest(),
      week:   this.streakManager.getWeek()
    };
  }

  /* ── Init ── */
  _initGreeting(){
    var h=new Date().getHours();
    var msg=h<12?'Bonjour 🌅':h<18?'Bon après-midi ☀️':'Bonsoir 🌙';
    if(this.ui.els.greet)this.ui.els.greet.textContent=msg;
  }
  _initDateMin(){
    var inp=document.getElementById('inputDateFin');
    if(inp)inp.min=today();
  }
  _hideSplash(){
    var self=this,splash=document.getElementById('splash');
    if(!splash){this.render();return;}
    setTimeout(function(){
      splash.classList.add('hidden');self.render();
      setTimeout(function(){if(splash.parentNode)splash.parentNode.removeChild(splash);},500);
    },1200);
  }

  /* ── Service Worker ── */
  _registerSW(){
    if('serviceWorker' in navigator){
      navigator.serviceWorker.register('./sw.js')
        .then(function(){console.log('[FF]SW✓');})
        .catch(function(e){console.warn('[FF]SW:',e);});
    }
  }

  /* ── Install Banner ── */
  _setupInstallBanner(){
    var dp=null;
    window.addEventListener('beforeinstallprompt',function(e){
      e.preventDefault();dp=e;
      var banner=document.createElement('div');banner.className='install-banner';
      banner.innerHTML='<span class="install-banner__icon">◈</span><div class="install-banner__text"><p class="install-banner__title">Installer FocusFlow</p><p class="install-banner__sub">Accès rapide depuis l\'écran d\'accueil</p></div><div class="install-banner__btns"><button type="button" class="btn-install" id="btnInstallPWA">Installer</button><button type="button" class="btn-install-close" id="btnCloseInstallPWA">✕</button></div>';
      document.body.appendChild(banner);
      setTimeout(function(){banner.classList.add('show');},2000);
      document.getElementById('btnInstallPWA').addEventListener('click',function(){
        banner.classList.remove('show');if(dp){dp.prompt();dp.userChoice.then(function(){dp=null;});}
      });
      document.getElementById('btnCloseInstallPWA').addEventListener('click',function(){banner.classList.remove('show');});
    });
  }

  /* ── Vérification deadlines (notifs push) ── */
  _checkDeadlines(){
    if(!this.notifEnabled)return;
    var lastCheck=localStorage.getItem('focusflow_last_deadline_check');
    if(lastCheck===today())return; /* déjà vérifié aujourd'hui */
    this.deadlineManager.checkAndNotify(this.objectifs);
    localStorage.setItem('focusflow_last_deadline_check',today());
  }

  /* ── Binding nav ── */
  _bindNav(){
    var self=this;
    document.querySelectorAll('.nav-item[data-view]').forEach(function(btn){
      btn.addEventListener('click',function(){self.navigate(btn.dataset.view);});
    });
    var fab=document.getElementById('fabBtn');
    if(fab)fab.addEventListener('click',function(){self.openSheet();});
  }

  /* ── Binding sheet ── */
  _bindSheet(){
    var self=this;
    var ov=document.getElementById('sheetOverlay');
    if(ov)ov.addEventListener('click',function(){self.closeSheet();});
    var bc=document.getElementById('btnCreer');
    if(bc)bc.addEventListener('click',function(){self.creerObjectif();});
    var it=document.getElementById('inputTitre');
    if(it)it.addEventListener('keydown',function(e){if(e.key==='Enter')self.creerObjectif();});
    document.querySelectorAll('.prio-btn').forEach(function(btn){
      btn.addEventListener('click',function(){
        document.querySelectorAll('.prio-btn').forEach(function(b){b.classList.remove('active');});
        btn.classList.add('active');
      });
    });
    document.querySelectorAll('.cat-btn').forEach(function(btn){
      btn.addEventListener('click',function(){
        document.querySelectorAll('.cat-btn').forEach(function(b){b.classList.remove('active');});
        btn.classList.add('active');
      });
    });
  }

  /* ── Binding filtres ── */
  _bindFilters(){
    var self=this;
    document.querySelectorAll('#statusFilters .chip').forEach(function(chip){
      chip.addEventListener('click',function(){
        document.querySelectorAll('#statusFilters .chip').forEach(function(c){c.classList.remove('active');});
        chip.classList.add('active');
        self.filtre=chip.dataset.filter||'all'; self.render();
      });
    });
    var ss=document.getElementById('sortSelect');
    if(ss)ss.addEventListener('change',function(){self.tri=ss.value;self.render();});
  }

  /* ── Binding stats & réglages ── */
  _bindStats(){
    var self=this;
    document.querySelectorAll('.theme-btn').forEach(function(btn){
      btn.addEventListener('click',function(){
        self.theme.set(btn.dataset.theme);
        document.querySelectorAll('.theme-btn').forEach(function(b){b.classList.remove('active');});
        btn.classList.add('active');

      });
    });

    /* Toggle notifications */
    var toggleNotif=document.getElementById('toggleNotif');
    if(toggleNotif){
      this.ui.updateNotifUI(this.notifEnabled);
      toggleNotif.addEventListener('click',function(){
        if(!self.notifEnabled){
          self.deadlineManager.requestPermission().then(function(granted){
            if(granted){
              self.notifEnabled=true;
              localStorage.setItem('focusflow_notif','true');
              self.ui.updateNotifUI(true);
              self.ui.toast('🔔 Alertes deadline activées !','success');
              self.deadlineManager.checkAndNotify(self.objectifs);
            } else {
              self.ui.toast('❌ Permission refusée par le navigateur','error');
            }
          });
        } else {
          self.notifEnabled=false;
          localStorage.setItem('focusflow_notif','false');
          self.ui.updateNotifUI(false);
          self.ui.toast('🔕 Notifications désactivées');
        }
      });
    }

    /* Export */
    var bex=document.getElementById('btnExport');
    if(bex)bex.addEventListener('click',function(){self.exportJSON();});
    /* Import */
    var bim=document.getElementById('inputImport');
    if(bim)bim.addEventListener('change',function(e){var f=e.target.files[0];if(f)self.importJSON(f);e.target.value='';});
    /* Reset */
    var br=document.getElementById('btnReset');
    if(br)br.addEventListener('click',function(){self.confirmerResetTotal();});
  }

  /* ── Navigation ── */
  navigate(view,objectifId){
    this.router.navigate(view,objectifId);
    this.ui.updateTopbar(view,objectifId||null);
    this.render();
  }
  goHome()           {this.navigate('home');}
  ouvrirDetail(oid)  {this.navigate('detail',oid);}
  setCatFiltre(cat)  {this.catFiltre=cat;this.render();}

  /* ── Sheet ── */
  openSheet(){
    document.getElementById('bottomSheet').classList.add('open');
    document.getElementById('sheetOverlay').classList.add('open');
    setTimeout(function(){var i=document.getElementById('inputTitre');if(i)i.focus();},360);
  }
  closeSheet(){
    document.getElementById('bottomSheet').classList.remove('open');
    document.getElementById('sheetOverlay').classList.remove('open');
  }

  /* ── Créer objectif ── */
  creerObjectif(){
    var et=document.getElementById('inputTitre');
    var ed=document.getElementById('inputDateFin');
    var titre=et?et.value.trim():'';
    var dateFin=ed?ed.value.trim():'';
    if(!titre){this.ui.toast('⚠️ Entrez un titre','error');if(et)et.focus();return;}
    if(!dateFin){this.ui.toast('⚠️ Choisissez une date limite','error');if(ed)ed.focus();return;}
    var ap=document.querySelector('.prio-btn.active');
    var ac=document.querySelector('.cat-btn.active');
    var obj=new Objectif(titre,dateFin,null,null,false,[],ap?ap.dataset.prio:'normal',ac?ac.dataset.cat:'personnel','');
    this.objectifs.unshift(obj);
    if(et)et.value='';if(ed)ed.value='';
    this.closeSheet();
    this._saveAndRender();
    this.ui.toast('🎯 Objectif créé !','success');
  }

  /* ── Modals confirmation ── */
  _openModal(iconTxt, titleTxt, msgHtml, cancelTxt, confirmTxt, confirmCls, onConfirm){
    var overlay=document.createElement('div'); overlay.className='modal-overlay';
    var modal=document.createElement('div'); modal.className='modal-card';
    modal.innerHTML=
      '<div class="modal-icon">'+iconTxt+'</div>'+
      '<h3 class="modal-title">'+titleTxt+'</h3>'+
      '<p class="modal-msg">'+msgHtml+'</p>'+
      '<div class="modal-actions">'+
        '<button type="button" class="modal-btn modal-btn--cancel" id="mCancel">'+cancelTxt+'</button>'+
        '<button type="button" class="modal-btn '+confirmCls+'" id="mConfirm">'+confirmTxt+'</button>'+
      '</div>';
    overlay.appendChild(modal); document.body.appendChild(overlay);
    requestAnimationFrame(function(){overlay.classList.add('open');});
    function close(){overlay.classList.remove('open');setTimeout(function(){if(overlay.parentNode)overlay.parentNode.removeChild(overlay);},300);}
    document.getElementById('mCancel').addEventListener('click',close);
    overlay.addEventListener('click',function(e){if(e.target===overlay)close();});
    document.getElementById('mConfirm').addEventListener('click',function(){close();onConfirm();});
  }

  confirmerSuppression(oid){
    var obj=this._find(oid); if(!obj)return;
    var self=this;
    this._openModal('🗑️','Supprimer l\'objectif ?',
      '<strong>'+obj.titre+'</strong><br/>Supprime aussi ses <strong>'+obj.taches.length+' tâche(s)</strong>.<br/><em>Irréversible.</em>',
      'Annuler','Supprimer','modal-btn--danger',
      function(){self.supprimerObjectif(oid);}
    );
  }
  confirmerResetTotal(){
    var total=this.objectifs.length;
    if(total===0){this.ui.toast('Aucun objectif à supprimer.');return;}
    var self=this;
    this._openModal('⚠️','Tout supprimer ?',
      'Vous allez supprimer <strong>'+total+' objectif'+(total>1?'s':'')+
      '</strong> et toutes leurs tâches.<br/><em>Irréversible.</em>',
      'Annuler','Tout supprimer','modal-btn--danger',
      function(){self.objectifs=[];self.storage.save(self.objectifs);self.render();self.ui.toast('🗑 Données supprimées','error',3000);}
    );
  }

  /* ── Actions objectifs ── */
  marquerTermine(oid){
    var obj=this._find(oid);if(!obj||obj.termine)return;
    obj.termine=true;
    this.storage.recordActivity('objective');
    this._saveAndRender();
    this.confetti.fire();
    this.ui.toast('🏆 Objectif terminé !','success',4000);
  }
  supprimerObjectif(oid){
    this.objectifs=this.objectifs.filter(function(o){return o.id!==oid;});
    this._saveAndRender();this.goHome();
    this.ui.toast('🗑 Objectif supprimé');
  }
  sauvegarderNotes(oid,texte){
    var obj=this._find(oid);if(!obj)return;
    obj.notes=texte;this.storage.save(this.objectifs);
  }

  /* ── Actions tâches ── */
  ajouterTache(oid,titre){
    var obj=this._find(oid);if(!obj||obj.termine)return;
    obj.ajouterTache(titre);this._saveAndRender();
  }
  validerTache(oid,tacheId){
    var obj=this._find(oid);if(!obj)return;
    var res=obj.validerTache(tacheId);
    if(!res.ok){this.ui.toast('⛔ '+res.msg,'error');this.render();return;}
    /* Enregistre l'activité du jour pour le streak */
    this.storage.recordActivity('task');
    var vient=obj.checkCompletion();
    if(vient)this.storage.recordActivity('objective');
    this._saveAndRender();
    if(vient){this.confetti.fire();this.ui.toast('🏆 Objectif complété !','success',4000);}
    else      {this.ui.toast('✅ Tâche validée !','success');}
  }
  supprimerTache(oid,tacheId){
    var obj=this._find(oid);if(!obj)return;
    obj.supprimerTache(tacheId);
    if(obj.taches.length>0&&obj.nbFaites<obj.taches.length)obj.termine=false;
    this._saveAndRender();
  }
  reordonnerTaches(oid,newIds){
    var obj=this._find(oid);if(!obj)return;
    var map={};obj.taches.forEach(function(t){map[t.id]=t;});
    var reordered=[];
    newIds.forEach(function(id){if(map[id])reordered.push(map[id]);});
    obj.taches.forEach(function(t){if(reordered.indexOf(t)===-1)reordered.push(t);});
    obj.taches=reordered;this._saveAndRender();
    this.ui.toast('↕️ Tâches réorganisées','',1500);
  }

  /* ── Export / Import ── */
  exportJSON(){
    var data=JSON.stringify(this.objectifs.map(function(o){return o.toJSON();}),null,2);
    var blob=new Blob([data],{type:'application/json'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');a.href=url;a.download='focusflow-backup-'+today()+'.json';
    document.body.appendChild(a);a.click();
    setTimeout(function(){document.body.removeChild(a);URL.revokeObjectURL(url);},1000);
    this.ui.toast('⬇️ Export réussi !','success');
  }
  importJSON(file){
    var self=this;
    var reader=new FileReader();
    reader.onload=function(e){
      try{
        var arr=JSON.parse(e.target.result);
        if(!Array.isArray(arr))throw new Error();
        var imported=arr.map(function(d){return Objectif.fromJSON(d);});
        if(window.confirm('Fusionner avec vos données actuelles ? (Non = Remplacer)')){
          var ids={};self.objectifs.forEach(function(o){ids[o.id]=true;});
          imported.forEach(function(o){if(!ids[o.id])self.objectifs.unshift(o);});
        } else {self.objectifs=imported;}
        self.storage.save(self.objectifs);self.render();
        self.ui.toast('⬆️ Import réussi ! ('+imported.length+' objectifs)','success');
      }catch(err){self.ui.toast('❌ Fichier invalide','error');}
    };
    reader.readAsText(file);
  }

  /* ── Utilitaires ── */
  _find(id){for(var i=0;i<this.objectifs.length;i++){if(this.objectifs[i].id===id)return this.objectifs[i];}return null;}
  _saveAndRender(){this.storage.save(this.objectifs);this.render();}

  render(){
    var view=this.router.currentView;
    var objId=this.router.detailObjId;
    var sd=this._getStreakData();
    var dl=this.deadlineManager;
    if(view==='home'){
      this.ui.renderHome(this.objectifs,this.filtre,this.catFiltre,this.tri,sd,dl);
    } else if(view==='detail'){
      var obj=this._find(objId);if(!obj){this.goHome();return;}
      this.ui.renderDetail(obj);
    } else if(view==='stats'){
      this.ui.renderStats(this.objectifs,sd,dl);
    } else if(view==='settings'){
      /* La vue Réglages est statique HTML — on met juste à jour le toggle notif */
      this.ui.updateNotifUI(this.notifEnabled);
    }
  }
}

/* ══════════════════════════════════════════════════════════
   POINT D'ENTRÉE
══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded',function(){
  window.app=new App();
});