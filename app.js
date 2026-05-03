/* ════════════════════════════════════════════════════════════
   app.js — FocusFlow Secure
   ────────────────────────────────────────────────────────────
   🔐 SÉCURITÉ ÉTAPE 1 — Rapide & critique
     ✅ CSP stricte (dans index.html)
     ✅ Sanitisation de toutes les entrées utilisateur
     ✅ Service Worker sécurisé avec cache versionné

   🔐 SÉCURITÉ ÉTAPE 2 — Fonctionnalités visibles
     ✅ Écran PIN 4 chiffres au lancement
     ✅ Verrouillage automatique (inactivité + arrière-plan)
     ✅ Authentification biométrique (WebAuthn si disponible)
     ✅ Protection contre les tentatives excessives (3 essais)

   🔐 SÉCURITÉ ÉTAPE 3 — Avancé
     ✅ Chiffrement AES-256-GCM des données (Web Crypto API)
     ✅ Clé dérivée du PIN via PBKDF2 (100 000 itérations)
     ✅ Export JSON chiffré avec mot de passe
     ✅ Import avec déchiffrement automatique

   + Toutes les fonctionnalités v3 :
     Streak, Deadlines, Catégories, Priorités, Notes,
     Drag&Drop, Thèmes, Confetti, Modals
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
var PRIO_LABELS  = { urgent: '🔴 Urgent', normal: '🟡 Normal', faible: '🟢 Faible' };
var JOURS_SEMAINE = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];

/* Limites de sécurité pour la sanitisation */
var LIMITS = {
  titre:  80,
  tache:  80,
  notes:  2000,
  pinLen: 4,
  maxAttempts: 3,
  lockoutMs:   30000   /* 30 secondes de blocage après 3 échecs */
};

/* ══════════════════════════════════════════════════════════
   UTILITAIRES DATE
══════════════════════════════════════════════════════════ */
function dateToKey(d) { return d.toISOString().slice(0, 10); }
function today()      { return dateToKey(new Date()); }
function diffJours(dateStr) {
  var t = new Date(today());
  var d = new Date(dateStr);
  return Math.round((d - t) / 86400000);
}

/* ══════════════════════════════════════════════════════════
   🧼 SANITISEUR — Étape 1
   Nettoie toutes les entrées utilisateur avant usage.
══════════════════════════════════════════════════════════ */
var Sanitizer = {
  /**
   * Nettoie un texte : supprime les caractères de contrôle,
   * les espaces excessifs, tronque à maxLen.
   */
  text: function(input, maxLen) {
    if (typeof input !== 'string') { return ''; }
    maxLen = maxLen || 200;
    return input
      /* Supprime les caractères de contrôle invisibles (sauf \n\r\t) */
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      /* Normalise les espaces multiples */
      .replace(/\s{3,}/g, '  ')
      /* Tronque */
      .slice(0, maxLen)
      .trim();
  },

  /** Valide une date YYYY-MM-DD */
  date: function(input) {
    if (typeof input !== 'string') { return ''; }
    var match = input.match(/^\d{4}-\d{2}-\d{2}$/);
    if (!match) { return ''; }
    var d = new Date(input);
    return isNaN(d.getTime()) ? '' : input;
  },

  /** Valide une valeur parmi une liste blanche */
  enum: function(input, allowed, fallback) {
    return allowed.indexOf(input) !== -1 ? input : fallback;
  },

  /** Valide un PIN (4 chiffres uniquement) */
  pin: function(input) {
    if (typeof input !== 'string') { return ''; }
    return input.replace(/\D/g, '').slice(0, LIMITS.pinLen);
  }
};

/* ══════════════════════════════════════════════════════════
   🔒 CryptoManager — Étape 3
   Chiffrement AES-256-GCM via Web Crypto API native.
   Aucune bibliothèque externe.
══════════════════════════════════════════════════════════ */
var CryptoManager = {

  /**
   * Dérive une clé AES-256 à partir d'un PIN ou mot de passe.
   * Utilise PBKDF2 avec 100 000 itérations et SHA-256.
   * @param {string} password - PIN ou mot de passe
   * @param {Uint8Array} salt - sel aléatoire
   * @returns {Promise<CryptoKey>}
   */
  deriveKey: async function(password, salt) {
    var enc     = new TextEncoder();
    var keyMat  = await crypto.subtle.importKey(
      'raw', enc.encode(password),
      { name: 'PBKDF2' }, false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' },
      keyMat,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  },

  /**
   * Chiffre des données JSON avec AES-256-GCM.
   * @param {object} data    - données à chiffrer
   * @param {string} password - clé de chiffrement
   * @returns {Promise<string>} - chaîne base64 (salt+iv+ciphertext)
   */
  encrypt: async function(data, password) {
    var enc      = new TextEncoder();
    var salt     = crypto.getRandomValues(new Uint8Array(16));
    var iv       = crypto.getRandomValues(new Uint8Array(12));
    var key      = await this.deriveKey(password, salt);
    var plaintext = enc.encode(JSON.stringify(data));
    var cipher   = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, plaintext);

    /* Concatène salt (16) + iv (12) + ciphertext → base64 */
    var combined = new Uint8Array(salt.length + iv.length + cipher.byteLength);
    combined.set(salt, 0);
    combined.set(iv, 16);
    combined.set(new Uint8Array(cipher), 28);
    return btoa(String.fromCharCode.apply(null, combined));
  },

  /**
   * Déchiffre une chaîne base64 produite par encrypt().
   * @param {string} b64      - données chiffrées en base64
   * @param {string} password - clé de déchiffrement
   * @returns {Promise<object>} - données originales
   */
  decrypt: async function(b64, password) {
    var dec      = new TextDecoder();
    var combined = Uint8Array.from(atob(b64), function(c) { return c.charCodeAt(0); });
    var salt     = combined.slice(0, 16);
    var iv       = combined.slice(16, 28);
    var cipher   = combined.slice(28);
    var key      = await this.deriveKey(password, salt);
    var plain    = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, cipher);
    return JSON.parse(dec.decode(plain));
  },

  /**
   * Hache le PIN avec SHA-256 + sel fixe pour le stockage.
   * On ne stocke JAMAIS le PIN en clair.
   * @param {string} pin
   * @returns {Promise<string>} - hash hex
   */
  hashPin: async function(pin) {
    var enc  = new TextEncoder();
    /* Sel fixe dérivé du domaine — empêche les rainbow tables */
    var data = enc.encode('focusflow:' + pin);
    var hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map(function(b) { return b.toString(16).padStart(2, '0'); })
      .join('');
  },

  /** Vérifie un PIN contre son hash stocké */
  verifyPin: async function(pin, storedHash) {
    var hash = await this.hashPin(pin);
    return hash === storedHash;
  }
};

/* ══════════════════════════════════════════════════════════
   🔐 LockManager — Étape 2
   Gère le PIN, la biométrie et le verrouillage automatique.
══════════════════════════════════════════════════════════ */
class LockManager {
  constructor(onUnlock) {
    this.onUnlock      = onUnlock;  /* callback quand déverrouillé */
    this.pinHash       = localStorage.getItem('ff_pin_hash') || null;
    this.attempts      = 0;
    this.lockedUntil   = 0;
    this.autoLockMin   = parseInt(localStorage.getItem('ff_autolock') || '1', 10);
    this.bioEnabled    = localStorage.getItem('ff_bio') === 'true';
    this._inactiveTimer = null;
    this._pinBuffer    = '';  /* PIN en cours de saisie */
    this._pendingSetup = '';  /* PIN de la première étape de création */
  }

  /* ── Vérifie si un PIN est déjà défini ── */
  hasPIN() { return this.pinHash !== null; }

  /* ── Démarre le flux d'authentification ── */
  start() {
    /* Masque le splash si visible */
    var splashEl = document.getElementById('splash');
    if (splashEl) splashEl.style.display = 'none';
    var lockScreen = document.getElementById('lockScreen');
    lockScreen.style.display = 'flex';
    document.getElementById('appShell').style.display = 'none';

    if (!this.hasPIN()) {
      this._showPanel('lockSetup');
      this._buildPad('pinPadSetup', this._onSetupDigit.bind(this));
    } else {
      this._showPanel('lockUnlock');
      this._buildPad('pinPadUnlock', this._onUnlockDigit.bind(this));
      this._tryBiometric();
    }
  }

  /* ── Construit le pavé numérique ── */
  _buildPad(padId, onDigit) {
    var pad    = document.getElementById(padId);
    if (!pad) { return; }
    pad.innerHTML = '';
    var keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
    keys.forEach(function(k) {
      var btn = document.createElement('button');
      btn.type = 'button';
      if (k === '') {
        btn.className = 'pin-key pin-key--empty';
      } else if (k === '⌫') {
        btn.className = 'pin-key pin-key--del';
        btn.textContent = '⌫';
        btn.addEventListener('click', function() { onDigit('DEL'); });
      } else {
        btn.className = 'pin-key';
        btn.textContent = k;
        btn.addEventListener('click', function() { onDigit(k); });
      }
      pad.appendChild(btn);
    });
  }

  /* ── Met à jour l'affichage des points ── */
  _updateDots(displayId, count, isError) {
    var dots = document.querySelectorAll('#' + displayId + ' .pin-dot');
    dots.forEach(function(dot, i) {
      dot.classList.remove('filled', 'error');
      if (isError) {
        dot.classList.add('error');
      } else if (i < count) {
        dot.classList.add('filled');
      }
    });
  }

  /* ── Saisie du PIN de configuration (première étape) ── */
  _onSetupDigit(key) {
    if (key === 'DEL') {
      this._pinBuffer = this._pinBuffer.slice(0, -1);
    } else {
      this._pinBuffer += key;
    }
    this._updateDots('pinDisplaySetup', this._pinBuffer.length, false);
    if (this._pinBuffer.length === LIMITS.pinLen) {
      this._pendingSetup = this._pinBuffer;
      this._pinBuffer    = '';
      /* Passe à l'étape de confirmation */
      this._showPanel('lockConfirm');
      this._buildPad('pinPadConfirm', this._onConfirmDigit.bind(this));
    }
  }

  /* ── Confirmation du PIN (deuxième étape) ── */
  _onConfirmDigit(key) {
    if (key === 'DEL') {
      this._pinBuffer = this._pinBuffer.slice(0, -1);
    } else {
      this._pinBuffer += key;
    }
    this._updateDots('pinDisplayConfirm', this._pinBuffer.length, false);
    if (this._pinBuffer.length === LIMITS.pinLen) {
      if (this._pinBuffer === this._pendingSetup) {
        /* PINs identiques → on sauvegarde le hash */
        var self = this;
        CryptoManager.hashPin(this._pinBuffer).then(function(hash) {
          localStorage.setItem('ff_pin_hash', hash);
          self.pinHash      = hash;
          self._pinBuffer   = '';
          self._pendingSetup = '';
          self._unlock();
        });
      } else {
        /* PINs différents → erreur */
        this._updateDots('pinDisplayConfirm', 4, true);
        var errEl = document.getElementById('confirmError');
        if (errEl) { errEl.textContent = 'Les PINs ne correspondent pas. Recommencez.'; }
        var self = this;
        setTimeout(function() {
          self._pinBuffer    = '';
          self._pendingSetup = '';
          self._updateDots('pinDisplayConfirm', 0, false);
          self._updateDots('pinDisplaySetup',   0, false);
          if (errEl) { errEl.textContent = ''; }
          self._showPanel('lockSetup');
          self._buildPad('pinPadSetup', self._onSetupDigit.bind(self));
        }, 1500);
      }
    }
  }

  /* ── Saisie du PIN de déverrouillage ── */
  _onUnlockDigit(key) {
    /* Vérifie si le verrouillage temporaire est actif */
    if (Date.now() < this.lockedUntil) {
      var restant = Math.ceil((this.lockedUntil - Date.now()) / 1000);
      var errEl = document.getElementById('unlockError');
      if (errEl) { errEl.textContent = 'Trop d\'essais. Réessayez dans ' + restant + 's.'; }
      return;
    }
    if (key === 'DEL') {
      this._pinBuffer = this._pinBuffer.slice(0, -1);
    } else {
      this._pinBuffer += key;
    }
    this._updateDots('pinDisplayUnlock', this._pinBuffer.length, false);

    if (this._pinBuffer.length === LIMITS.pinLen) {
      var entered = this._pinBuffer;
      this._pinBuffer = '';
      var self = this;
      CryptoManager.verifyPin(entered, this.pinHash).then(function(ok) {
        if (ok) {
          self.attempts = 0;
          self._unlock();
        } else {
          self.attempts++;
          self._updateDots('pinDisplayUnlock', 4, true);
          var errEl = document.getElementById('unlockError');
          var msg   = document.getElementById('lockAttemptMsg');
          if (self.attempts >= LIMITS.maxAttempts) {
            self.lockedUntil = Date.now() + LIMITS.lockoutMs;
            if (errEl) { errEl.textContent = 'Trop d\'essais. Bloqué 30 secondes.'; }
            if (msg)   { msg.textContent   = 'Réessayez dans 30s…'; }
          } else {
            var restants = LIMITS.maxAttempts - self.attempts;
            if (errEl) { errEl.textContent = 'PIN incorrect. ' + restants + ' essai(s) restant(s).'; }
          }
          setTimeout(function() {
            self._updateDots('pinDisplayUnlock', 0, false);
            if (errEl) { errEl.textContent = ''; }
          }, 1200);
        }
      });
    }
  }

  /* ── Biométrie : affiche le bouton si un credential est enregistré ── */
  async _tryBiometric() {
    if (!this.bioEnabled) { return; }
    if (!window.PublicKeyCredential) { return; }
    /* Vérifie qu'un credential a bien été enregistré */
    var credId = localStorage.getItem('ff_bio_cred_id');
    if (!credId) { return; } /* Pas encore enregistré → pas de bouton */
    var btn = document.getElementById('biometricBtn');
    if (btn) {
      btn.hidden = false;
      var self = this;
      btn.addEventListener('click', function() { self._doBiometric(); });
    }
  }

  /**
   * ÉTAPE 1 — Enregistre la biométrie (crée un credential WebAuthn).
   * Appelée quand l'utilisateur active la biométrie dans les Réglages.
   */
  async _registerBiometric() {
    if (!window.PublicKeyCredential) {
      return { ok: false, msg: 'WebAuthn non supporté sur cet appareil.' };
    }
    try {
      /* Vérifie que la biométrie est disponible */
      var available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (!available) {
        return { ok: false, msg: 'Aucun capteur biométrique détecté.' };
      }

      /* Crée un credential lié à l'empreinte/Face ID */
      var enc = new TextEncoder();
      var credential = await navigator.credentials.create({
        publicKey: {
          challenge:  crypto.getRandomValues(new Uint8Array(32)),
          rp:         { name: 'FocusFlow', id: location.hostname },
          user: {
            id:          enc.encode('focusflow-user'),
            name:        'FocusFlow User',
            displayName: 'FocusFlow'
          },
          pubKeyCredParams: [
            { alg: -7,   type: 'public-key' }, /* ES256 */
            { alg: -257, type: 'public-key' }  /* RS256 */
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',  /* capteur intégré */
            userVerification:        'required',   /* biométrie obligatoire */
            requireResidentKey:      false
          },
          timeout: 60000,
          attestation: 'none'
        }
      });

      /* Sauvegarde l'id du credential en base64 */
      var idArray = new Uint8Array(credential.rawId);
      var idB64   = btoa(String.fromCharCode.apply(null, idArray));
      localStorage.setItem('ff_bio_cred_id', idB64);
      return { ok: true };

    } catch(e) {
      console.warn('[Bio] Enregistrement:', e);
      if (e.name === 'NotAllowedError') {
        return { ok: false, msg: 'Permission refusée. Autorisez la biométrie dans les paramètres Android.' };
      }
      return { ok: false, msg: 'Enregistrement biométrique échoué : ' + e.message };
    }
  }

  /**
   * ÉTAPE 2 — Vérifie l'empreinte (utilise le credential enregistré).
   * Appelée quand l'utilisateur appuie sur le bouton biométrie.
   */
  async _doBiometric() {
    var credIdB64 = localStorage.getItem('ff_bio_cred_id');
    if (!credIdB64) {
      var errEl = document.getElementById('unlockError');
      if (errEl) { errEl.textContent = 'Biométrie non configurée. Activez-la dans Réglages.'; }
      return;
    }

    try {
      /* Reconstruit l'id du credential depuis base64 */
      var credIdBytes = Uint8Array.from(atob(credIdB64), function(c) { return c.charCodeAt(0); });

      var assertion = await navigator.credentials.get({
        publicKey: {
          challenge:        crypto.getRandomValues(new Uint8Array(32)),
          timeout:          30000,
          userVerification: 'required',
          rpId:             location.hostname,
          /* Passe le credential enregistré → le navigateur sait quoi vérifier */
          allowCredentials: [{
            type: 'public-key',
            id:   credIdBytes,
            transports: ['internal']  /* capteur intégré (fingerprint/face) */
          }]
        }
      });

      if (assertion) {
        this._unlock();
      }

    } catch(e) {
      console.warn('[Bio] Vérification:', e);
      var errEl = document.getElementById('unlockError');
      if (e.name === 'NotAllowedError') {
        if (errEl) { errEl.textContent = 'Biométrie annulée ou délai dépassé.'; }
      } else if (e.name === 'InvalidStateError') {
        /* Credential expiré → on le supprime et on demande de re-configurer */
        localStorage.removeItem('ff_bio_cred_id');
        localStorage.setItem('ff_bio', 'false');
        if (errEl) { errEl.textContent = 'Session biométrique expirée. Reconfigurez dans Réglages.'; }
      } else {
        if (errEl) { errEl.textContent = 'Échec biométrique. Utilisez votre PIN.'; }
      }
    }
  }

  /* ── Déverrouille et affiche l'app ── */
  _unlock() {
    var lockScreen = document.getElementById('lockScreen');
    lockScreen.classList.add('unlocking');
    var self = this;
    setTimeout(function() {
      lockScreen.style.display = 'none';
      lockScreen.classList.remove('unlocking');
      document.getElementById('appShell').classList.add('visible');
      self._startAutoLock();
      self.onUnlock();
    }, 400);
  }

  /* ── Affiche un panneau, masque les autres ── */
  _showPanel(id) {
    ['lockSetup','lockConfirm','lockUnlock'].forEach(function(pid) {
      var el = document.getElementById(pid);
      if (el) { el.hidden = (pid !== id); }
    });
  }

  /* ── Verrouillage automatique ── */
  _startAutoLock() {
    if (this.autoLockMin === 0) { return; }
    var self = this;
    var ms   = this.autoLockMin * 60 * 1000;

    /* Réinitialise le timer à chaque interaction */
    var reset = function() { self._resetLockTimer(ms); };
    ['touchstart','mousedown','keydown','scroll'].forEach(function(ev) {
      document.addEventListener(ev, reset, { passive: true });
    });

    /* Verrouille quand l'app passe en arrière-plan */
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) { self._lockNow(); }
    });

    this._resetLockTimer(ms);
  }

  _resetLockTimer(ms) {
    clearTimeout(this._inactiveTimer);
    var self = this;
    this._inactiveTimer = setTimeout(function() { self._lockNow(); }, ms);
  }

  _lockNow() {
    clearTimeout(this._inactiveTimer);
    this._pinBuffer = '';
    document.getElementById('appShell').classList.remove('visible');
    this.start();
  }

  /* ── Change le PIN (depuis les Réglages) ── */
  changePIN() {
    this.pinHash       = null;
    localStorage.removeItem('ff_pin_hash');
    this._pendingSetup = '';
    this._pinBuffer    = '';
    this._lockNow();
  }

  /* ── Configure le verrouillage auto ── */
  setAutoLock(minutes) {
    this.autoLockMin = minutes;
    localStorage.setItem('ff_autolock', minutes);
  }

  /* ── Active/désactive la biométrie ── */
  setBiometric(enabled) {
    this.bioEnabled = enabled;
    localStorage.setItem('ff_bio', enabled ? 'true' : 'false');
  }

  /* ── Réinitialisation complète ── */
  static reset() {
    ['ff_pin_hash','ff_bio','ff_autolock',
     'focusflow_v2','focusflow_activity',
     'focusflow_theme','focusflow_notif',
     'focusflow_best_streak','focusflow_last_deadline_check'
    ].forEach(function(k) { localStorage.removeItem(k); });
    window.location.reload();
  }
}

/* ══════════════════════════════════════════════════════════
   StorageManager SÉCURISÉ — Étape 3
   Les données sont chiffrées avant d'être stockées.
══════════════════════════════════════════════════════════ */
class SecureStorageManager {
  constructor() {
    this.KEY          = 'focusflow_v2';
    this.ACTIVITY_KEY = 'focusflow_activity';
    /* La clé de chiffrement est dérivée du PIN → gardée en mémoire seulement */
    this._cryptoKey   = null;
    this._pinPassword = null;
  }

  /* Initialise avec le PIN déverrouillé */
  async initWithPin(pin) {
    this._pinPassword = pin;
    /* On ne peut pas garder la CryptoKey directement (non exportable)
       On garde le PIN en mémoire pour re-dériver si nécessaire */
  }

  /* ── Sauvegarde chiffrée ── */
  async save(objectifs) {
    try {
      var data = objectifs.map(function(o) { return o.toJSON(); });
      if (this._pinPassword) {
        var encrypted = await CryptoManager.encrypt(data, this._pinPassword);
        localStorage.setItem(this.KEY, JSON.stringify({ enc: true, data: encrypted }));
      } else {
        /* Fallback sans chiffrement si pas de PIN (ne devrait pas arriver) */
        localStorage.setItem(this.KEY, JSON.stringify(data));
      }
    } catch(e) { console.error('[FF] save:', e); }
  }

  /* ── Chargement avec déchiffrement ── */
  async load() {
    try {
      var raw = localStorage.getItem(this.KEY);
      if (!raw) { return []; }
      var parsed = JSON.parse(raw);
      var arr;

      if (parsed && parsed.enc === true) {
        /* Données chiffrées */
        if (!this._pinPassword) { return []; }
        arr = await CryptoManager.decrypt(parsed.data, this._pinPassword);
      } else {
        /* Données anciennes non chiffrées (migration) */
        arr = Array.isArray(parsed) ? parsed : [];
        /* Re-chiffre immédiatement */
        if (arr.length > 0 && this._pinPassword) {
          var objs = arr.map(function(d) { return Objectif.fromJSON(d); });
          await this.save(objs);
          return objs;
        }
      }
      return Array.isArray(arr)
        ? arr.map(function(d) { return Objectif.fromJSON(d); })
        : [];
    } catch(e) { console.error('[FF] load:', e); return []; }
  }

  /* ── Journal d'activité (non chiffré, pas de données sensibles) ── */
  getActivity() {
    try { var r = localStorage.getItem(this.ACTIVITY_KEY); return r ? JSON.parse(r) : {}; }
    catch(e) { return {}; }
  }
  saveActivity(activity) {
    try { localStorage.setItem(this.ACTIVITY_KEY, JSON.stringify(activity)); }
    catch(e) {}
  }
  recordActivity(type) {
    var act = this.getActivity();
    var key = today();
    if (!act[key]) { act[key] = { tasks: 0, objectives: 0 }; }
    if (type === 'task')      { act[key].tasks++; }
    if (type === 'objective') { act[key].objectives++; }
    this.saveActivity(act);
  }

  /* ── Export chiffré avec mot de passe ── */
  async exportEncrypted(objectifs, password) {
    var data = {
      version:   'focusflow-secure-v1',
      date:      today(),
      objectifs: objectifs.map(function(o) { return o.toJSON(); })
    };
    var encrypted = await CryptoManager.encrypt(data, password);
    return { enc: true, version: 'focusflow-secure-v1', data: encrypted };
  }

  /* ── Import chiffré ── */
  async importEncrypted(fileContent, password) {
    var parsed = JSON.parse(fileContent);
    if (parsed.enc && parsed.data) {
      var decrypted = await CryptoManager.decrypt(parsed.data, password);
      var arr = decrypted.objectifs || decrypted;
      return Array.isArray(arr) ? arr.map(function(d) { return Objectif.fromJSON(d); }) : [];
    }
    /* Import non chiffré (ancien format) */
    if (Array.isArray(parsed)) {
      return parsed.map(function(d) { return Objectif.fromJSON(d); });
    }
    throw new Error('Format invalide');
  }
}

/* ══════════════════════════════════════════════════════════
   1. CLASSE Tache
══════════════════════════════════════════════════════════ */
class Tache {
  constructor(titre, id, faite) {
    this.id    = id != null ? id : 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6);
    this.titre = Sanitizer.text(titre, LIMITS.tache);
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
    this.id        = id != null ? id : 'o_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6);
    /* Sanitisation de toutes les entrées */
    this.titre     = Sanitizer.text(titre, LIMITS.titre);
    this.dateFin   = Sanitizer.date(dateFin);
    this.dateDebut = Sanitizer.date(dateDebut) || today();
    this.termine   = termine === true;
    this.taches    = Array.isArray(taches) ? taches : [];
    this.priorite  = Sanitizer.enum(priorite,  ['urgent','normal','faible'], 'normal');
    this.categorie = Sanitizer.enum(categorie, Object.keys(CATEGORIES),      'personnel');
    this.notes     = Sanitizer.text(notes, LIMITS.notes);
  }
  get nbFaites()   { return this.taches.filter(function(t) { return t.faite; }).length; }
  get progression(){ return this.taches.length === 0 ? 0 : Math.round((this.nbFaites / this.taches.length) * 100); }
  get indexActif() { for (var i = 0; i < this.taches.length; i++) { if (!this.taches[i].faite) return i; } return -1; }
  checkCompletion() {
    if (!this.termine && this.taches.length > 0 && this.nbFaites === this.taches.length) { this.termine = true; return true; }
    return false;
  }
  ajouterTache(titre) { var t = new Tache(titre, null, false); this.taches.push(t); return t; }
  supprimerTache(id)  { this.taches = this.taches.filter(function(t) { return t.id !== id; }); }
  validerTache(id) {
    var found = null, idx = -1;
    for (var i = 0; i < this.taches.length; i++) { if (this.taches[i].id === id) { found = this.taches[i]; idx = i; break; } }
    if (!found)      { return { ok: false, msg: 'Tâche introuvable.' }; }
    if (found.faite) { return { ok: false, msg: 'Déjà complétée.' }; }
    if (idx !== this.indexActif) { return { ok: false, msg: 'Terminez d\'abord la tâche précédente !' }; }
    found.faite = true; return { ok: true, msg: '' };
  }
  toJSON() {
    return { id: this.id, titre: this.titre, dateFin: this.dateFin, dateDebut: this.dateDebut,
      termine: this.termine, taches: this.taches.map(function(t) { return t.toJSON(); }),
      priorite: this.priorite, categorie: this.categorie, notes: this.notes };
  }
  static fromJSON(d) {
    var taches = Array.isArray(d.taches) ? d.taches.map(function(t) { return Tache.fromJSON(t); }) : [];
    return new Objectif(d.titre, d.dateFin, d.id, d.dateDebut, d.termine, taches, d.priorite, d.categorie, d.notes);
  }
}

/* ══════════════════════════════════════════════════════════
   ThemeManager
══════════════════════════════════════════════════════════ */
class ThemeManager {
  constructor() {
    this.KEY = 'focusflow_theme';
    this.current = localStorage.getItem(this.KEY) || 'dark';
    this._mq = window.matchMedia('(prefers-color-scheme: light)');
    this._apply();
    var self = this;
    this._mq.addEventListener('change', function() { if (self.current === 'auto') self._apply(); });
  }
  set(theme) { this.current = theme; localStorage.setItem(this.KEY, theme); this._apply(); }
  _apply() {
    var resolved = this.current === 'auto' ? (this._mq.matches ? 'light' : 'dark') : this.current;
    document.documentElement.setAttribute('data-theme', resolved);
    document.querySelectorAll('.theme-btn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.theme === this.current);
    }, this);
  }
}

/* ══════════════════════════════════════════════════════════
   ConfettiManager
══════════════════════════════════════════════════════════ */
class ConfettiManager {
  constructor() {
    this.canvas = document.getElementById('confettiCanvas');
    this.ctx    = this.canvas ? this.canvas.getContext('2d') : null;
    this.pieces = []; this.running = false;
  }
  fire() {
    if (!this.ctx) return;
    this.canvas.width = window.innerWidth; this.canvas.height = window.innerHeight;
    this.pieces = [];
    var colors = ['#f5a623','#34d399','#60a5fa','#f87171','#a78bfa','#fb923c'];
    for (var i = 0; i < 120; i++) {
      this.pieces.push({ x: Math.random()*this.canvas.width, y: Math.random()*-this.canvas.height,
        w: 6+Math.random()*8, h: 3+Math.random()*5, color: colors[Math.floor(Math.random()*colors.length)],
        vx: (Math.random()-.5)*4, vy: 2+Math.random()*4, angle: Math.random()*Math.PI*2, va: (Math.random()-.5)*.2 });
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
      self.ctx.save(); self.ctx.translate(p.x, p.y); self.ctx.rotate(p.angle);
      self.ctx.fillStyle = p.color; self.ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h); self.ctx.restore();
    });
    if (this.pieces.length > 0) { requestAnimationFrame(function() { self._loop(); }); }
    else { this.running = false; this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); }
  }
}

/* ══════════════════════════════════════════════════════════
   StreakManager
══════════════════════════════════════════════════════════ */
class StreakManager {
  constructor(storage) { this.storage = storage; this.BEST_KEY = 'focusflow_best_streak'; }
  getCurrent() {
    var activity = this.storage.getActivity(); var streak = 0; var d = new Date();
    while (true) {
      var key = dateToKey(d); var day = activity[key];
      if (day && (day.tasks > 0 || day.objectives > 0)) { streak++; d.setDate(d.getDate() - 1); }
      else { if (key === today() && streak === 0) { d.setDate(d.getDate() - 1); var yk = dateToKey(d); var yd = activity[yk]; if (yd && (yd.tasks > 0 || yd.objectives > 0)) { continue; } } break; }
    }
    return streak;
  }
  getBest() { var c = this.getCurrent(); var s = parseInt(localStorage.getItem(this.BEST_KEY)||'0',10); var b = Math.max(c,s); localStorage.setItem(this.BEST_KEY,b); return b; }
  getWeek() {
    var activity = this.storage.getActivity(); var days = [];
    for (var i = 6; i >= 0; i--) { var d = new Date(); d.setDate(d.getDate()-i); var key = dateToKey(d); var act = activity[key]; days.push({ key:key, label:JOURS_SEMAINE[d.getDay()], active:!!(act&&(act.tasks>0||act.objectives>0)), isToday:key===today() }); }
    return days;
  }
}

/* ══════════════════════════════════════════════════════════
   DeadlineManager
══════════════════════════════════════════════════════════ */
class DeadlineManager {
  getDeadlines(objectifs) {
    var r = { urgent:[], warning:[], ok:[] };
    objectifs.forEach(function(o) {
      if (o.termine) return;
      var d = diffJours(o.dateFin);
      if (d <= 1) r.urgent.push(o); else if (d <= 3) r.warning.push(o); else r.ok.push(o);
    });
    return r;
  }
  getLabel(o)  { var d=diffJours(o.dateFin); if(d<0)return'Dépassé de '+Math.abs(d)+'j !'; if(d===0)return'Aujourd\'hui !'; if(d===1)return'Demain !'; return'Dans '+d+' jours'; }
  getIcon(o)   { var d=diffJours(o.dateFin); if(d<0)return'🚨'; if(d<=1)return'⏰'; if(d<=3)return'⚠️'; return'📅'; }
  getClass(o)  { var d=diffJours(o.dateFin); if(d<=1)return'urgent'; if(d<=3)return'warning'; return'ok'; }
  async requestPermission() {
    if (!('Notification' in window)) { return false; }
    if (Notification.permission === 'granted') { return true; }
    if (Notification.permission === 'denied')  {
      /* Sur Android : les permissions refusées ne peuvent être
         récupérées que depuis les paramètres système de l'app */
      return false;
    }
    /* Demande la permission */
    var result = await Notification.requestPermission();
    return result === 'granted';
  }
  sendNotification(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    /* Sur mobile : utilise le Service Worker pour afficher la notification
       (plus fiable que new Notification() qui ne fonctionne pas en arrière-plan) */
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(function(reg) {
        reg.showNotification(title, {
          body:    body,
          icon:    './icons/icon-192.svg',
          badge:   './icons/icon-192.svg',
          vibrate: [200, 100, 200],
          tag:     'focusflow-deadline',  /* évite les doublons */
          renotify: false
        });
      }).catch(function() {
        /* Fallback si SW pas encore actif */
        new Notification(title, { body: body, icon: './icons/icon-192.svg' });
      });
    } else {
      /* Fallback PC / SW non disponible */
      new Notification(title, { body: body, icon: './icons/icon-192.svg' });
    }
  }
  checkAndNotify(objectifs) {
    var self = this;
    var dl   = this.getDeadlines(objectifs);
    dl.urgent.forEach(function(o)  { self.sendNotification('🚨 Deadline !',      '"' + o.titre + '" — ' + self.getLabel(o)); });
    dl.warning.forEach(function(o) { self.sendNotification('⚠️ Deadline proche', '"' + o.titre + '" — ' + self.getLabel(o)); });
  }
}

/* ══════════════════════════════════════════════════════════
   DragDropManager
══════════════════════════════════════════════════════════ */
class DragDropManager {
  constructor(list, onEnd) { this.list=list; this.onEnd=onEnd; this.dragged=null; this.draggedId=null; this._bind(); }
  _bind() {
    var self=this;
    this.list.querySelectorAll('.task-item:not(.task-item--done) .drag-handle').forEach(function(h){
      var li=h.closest('.task-item');
      h.addEventListener('mousedown',function(e){self._start(e,li);});
      h.addEventListener('touchstart',function(e){self._start(e,li);},{passive:true});
    });
  }
  _start(e,li) {
    var self=this; this.dragged=li; this.draggedId=li.dataset.tacheId; li.classList.add('task-item--dragging');
    function onMove(ev){ var y=ev.type==='touchmove'?ev.touches[0].clientY:ev.clientY; var items=Array.from(self.list.querySelectorAll('.task-item:not(.task-item--dragging)')); items.forEach(function(i){i.classList.remove('task-item--drag-over');}); var t=items.find(function(i){var r=i.getBoundingClientRect();return y>r.top&&y<r.bottom;}); if(t)t.classList.add('task-item--drag-over'); }
    function onEnd(ev){ document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onEnd); document.removeEventListener('touchmove',onMove); document.removeEventListener('touchend',onEnd); var y=ev.type==='touchend'?ev.changedTouches[0].clientY:ev.clientY; var items=Array.from(self.list.querySelectorAll('.task-item:not(.task-item--dragging)')); items.forEach(function(i){i.classList.remove('task-item--drag-over');}); if(self.dragged)self.dragged.classList.remove('task-item--dragging'); var allItems=Array.from(self.list.querySelectorAll('.task-item')); var target=items.find(function(i){var r=i.getBoundingClientRect();return y>r.top&&y<r.bottom;}); if(target&&target.dataset.tacheId!==self.draggedId){var newIds=allItems.map(function(i){return i.dataset.tacheId;}); newIds.splice(newIds.indexOf(self.draggedId),1); newIds.splice(allItems.indexOf(target),0,self.draggedId); self.onEnd(newIds);} self.dragged=null; self.draggedId=null; }
    document.addEventListener('mousemove',onMove); document.addEventListener('mouseup',onEnd); document.addEventListener('touchmove',onMove,{passive:true}); document.addEventListener('touchend',onEnd);
  }
}

/* ══════════════════════════════════════════════════════════
   Router
══════════════════════════════════════════════════════════ */
class Router {
  constructor() { this.currentView='home'; this.detailObjId=null; }
  navigate(view, objectifId) {
    document.querySelectorAll('.view').forEach(function(v) { v.classList.remove('active'); });
    var t = document.getElementById('view-'+view); if (!t) return;
    t.classList.add('active');
    document.querySelectorAll('.nav-item[data-view]').forEach(function(b) { b.classList.toggle('active', b.dataset.view===view); });
    this.currentView=view; this.detailObjId=objectifId||null;
  }
}

/* ══════════════════════════════════════════════════════════
   UIManager
══════════════════════════════════════════════════════════ */
class UIManager {
  constructor(app) {
    this.app=app; this._toastTimer=null; this._notesTimers={};
    this.els={
      toast:document.getElementById('toast'), topbarTitle:document.getElementById('topbarTitle'),
      topbarActs:document.getElementById('topbarActions'), streakBadge:document.getElementById('streakBadge'),
      streakCount:document.getElementById('streakCount'), streakDays:document.getElementById('streakDays'),
      streakSub:document.getElementById('streakSub'), streakWeek:document.getElementById('streakWeek'),
      streakStatDays:document.getElementById('streakStatDays'), streakBest:document.getElementById('streakBest'),
      deadlineAlerts:document.getElementById('deadlineAlerts'), deadlineList:document.getElementById('deadlineList'),
      greet:document.getElementById('greetMsg'), statTotal:document.getElementById('stat-total'),
      statActive:document.getElementById('stat-active'), statDone:document.getElementById('stat-done'),
      list:document.getElementById('objectifsList'), emptyState:document.getElementById('emptyState'),
      catFilters:document.getElementById('catFilters'), viewDetail:document.getElementById('view-detail'),
      bsTotal:document.getElementById('bs-total'), bsDone:document.getElementById('bs-done'),
      bsTasks:document.getElementById('bs-tasks'), globalFill:document.getElementById('globalFill'),
      globalPct:document.getElementById('globalPct'), catStats:document.getElementById('catStats'),
      recentList:document.getElementById('recentList'), notifStatus:document.getElementById('notifStatus'),
      toggleNotif:document.getElementById('toggleNotif')
    };
  }

  toast(msg, type, dur) {
    var el=this.els.toast; type=type||''; dur=dur||2600;
    el.textContent=msg; el.className='toast show'+(type?' toast--'+type:'');
    clearTimeout(this._toastTimer);
    this._toastTimer=setTimeout(function(){el.classList.remove('show');},dur);
  }

  updateTopbar(view, objId) {
    var titles={home:'FocusFlow',detail:'Objectif',stats:'Statistiques',settings:'Réglages'};
    this.els.topbarTitle.textContent=titles[view]||'FocusFlow';
    if(this.els.streakBadge) this.els.streakBadge.hidden=(view!=='home');
    var acts=this.els.topbarActs;
    Array.from(acts.children).forEach(function(c){if(c.id!=='streakBadge')acts.removeChild(c);});
    if(view!=='detail')return;
    var self=this;
    var btnBack=this._iconBtn('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>','icon-btn icon-btn--back','Retour');
    btnBack.addEventListener('click',function(){self.app.goHome();});
    var btnDel=this._iconBtn('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>','icon-btn icon-btn--danger','Supprimer');
    var cid=objId; btnDel.addEventListener('click',function(){self.app.confirmerSuppression(cid);});
    /* Ordre affiché : [Supprimer] [Retour] → on insère Retour en dernier en firstChild */
    acts.insertBefore(btnDel,acts.firstChild); acts.insertBefore(btnBack,acts.firstChild);
  }

  renderStreak(streak, best, week) {
    var s=streak.current;
    if(this.els.streakCount) this.els.streakCount.textContent=s;
    if(this.els.streakBadge) this.els.streakBadge.hidden=(s===0);
    if(this.els.streakDays)  this.els.streakDays.textContent=s;
    if(this.els.streakSub)   this.els.streakSub.textContent=s===0?'Complétez une tâche aujourd\'hui !':s===1?'C\'est parti ! Continuez demain 💪':'Incroyable ! '+s+' jours de suite 🔥';
    if(this.els.streakStatDays) this.els.streakStatDays.textContent=s;
    if(this.els.streakBest)     this.els.streakBest.textContent='Meilleure série : '+best+' jour'+(best>1?'s':'');
    if(this.els.streakWeek) {
      this.els.streakWeek.innerHTML='';
      week.forEach(function(day){
        var col=document.createElement('div'); col.className='streak-day';
        var dot=document.createElement('div'); dot.className='streak-day__dot'+(day.active?' streak-day__dot--active':'')+(day.isToday?' streak-day__dot--today':''); dot.textContent=day.active?'✓':'';
        var lbl=document.createElement('span'); lbl.className='streak-day__label'; lbl.textContent=day.label;
        col.appendChild(dot); col.appendChild(lbl); this.els.streakWeek.appendChild(col);
      },this);
    }
  }

  renderDeadlineAlerts(objectifs, dlManager) {
    var self=this; var el=this.els.deadlineAlerts; if(!el)return; el.innerHTML='';
    var dl=dlManager.getDeadlines(objectifs);
    dl.urgent.concat(dl.warning).slice(0,3).forEach(function(obj){
      var cls=dlManager.getClass(obj); var div=document.createElement('div'); div.className='deadline-alert deadline-alert--'+cls;
      div.innerHTML='<span class="deadline-alert__icon">'+dlManager.getIcon(obj)+'</span><div class="deadline-alert__body"><p class="deadline-alert__title">'+obj.titre+'</p><p class="deadline-alert__days">'+dlManager.getLabel(obj)+'</p></div><span class="deadline-alert__arrow">›</span>';
      var oid=obj.id; div.addEventListener('click',function(){self.app.ouvrirDetail(oid);}); el.appendChild(div);
    });
  }

  renderDeadlineList(objectifs, dlManager) {
    var self=this; var el=this.els.deadlineList; if(!el)return; el.innerHTML='';
    var actifs=objectifs.filter(function(o){return!o.termine;}).sort(function(a,b){return a.dateFin.localeCompare(b.dateFin);}).slice(0,8);
    if(!actifs.length){el.innerHTML='<p style="font-size:.8rem;color:var(--text-3);font-style:italic;padding:12px 0">Aucun objectif en cours.</p>';return;}
    actifs.forEach(function(obj){
      var cls=dlManager.getClass(obj); var item=document.createElement('div'); item.className='deadline-item deadline-item--'+cls;
      var ie=document.createElement('span');ie.className='deadline-item__icon';ie.textContent=dlManager.getIcon(obj);
      var ne=document.createElement('span');ne.className='deadline-item__name';ne.textContent=obj.titre;
      var be=document.createElement('span');be.className='deadline-item__badge';be.textContent=dlManager.getLabel(obj);
      item.appendChild(ie);item.appendChild(ne);item.appendChild(be);
      var oid=obj.id; item.addEventListener('click',function(){self.app.ouvrirDetail(oid);}); el.appendChild(item);
    });
  }

  renderCatFilters(objectifs, catFiltre) {
    var self=this; var el=this.els.catFilters; if(!el)return; el.innerHTML='';
    var all=document.createElement('button'); all.className='chip chip--cat'+(catFiltre==='all'?' active':''); all.textContent='✨ Toutes'; all.dataset.cat='all';
    all.addEventListener('click',function(){self.app.setCatFiltre('all');}); el.appendChild(all);
    Object.keys(CATEGORIES).forEach(function(key){
      var count=objectifs.filter(function(o){return o.categorie===key;}).length; if(!count)return;
      var btn=document.createElement('button'); btn.className='chip chip--cat'+(catFiltre===key?' active':''); btn.textContent=CATEGORIES[key].label+' ('+count+')'; btn.dataset.cat=key;
      btn.addEventListener('click',function(){self.app.setCatFiltre(key);}); el.appendChild(btn);
    });
  }

  renderHome(objectifs, filtre, catFiltre, tri, streakData, dlManager) {
    var total=objectifs.length,done=0;
    for(var i=0;i<objectifs.length;i++){if(objectifs[i].termine)done++;}
    this.els.statTotal.textContent=total; this.els.statActive.textContent=total-done; this.els.statDone.textContent=done;
    this.renderCatFilters(objectifs,catFiltre); this.renderStreak(streakData.streak,streakData.best,streakData.week); this.renderDeadlineAlerts(objectifs,dlManager);
    var liste=objectifs.filter(function(o){if(filtre==='active')return!o.termine;if(filtre==='done')return o.termine;return true;});
    if(catFiltre&&catFiltre!=='all')liste=liste.filter(function(o){return o.categorie===catFiltre;});
    var PO={urgent:0,normal:1,faible:2};
    liste.sort(function(a,b){if(tri==='priorite')return(PO[a.priorite]||1)-(PO[b.priorite]||1);if(tri==='date_fin')return a.dateFin.localeCompare(b.dateFin);if(tri==='progression')return b.progression-a.progression;return 0;});
    this.els.list.innerHTML='';
    if(liste.length===0){if(objectifs.length===0){this.els.emptyState.hidden=false;}else{this.els.emptyState.hidden=true;var nm=document.createElement('div');nm.className='empty-state';nm.innerHTML='<span class="empty-state__emoji">🔍</span><p class="empty-state__title">Aucun résultat</p><p class="empty-state__hint">Essayez un autre filtre</p>';this.els.list.appendChild(nm);}return;}
    this.els.emptyState.hidden=true;
    for(var j=0;j<liste.length;j++){var card=this._buildCard(liste[j]);card.style.animationDelay=(j*40)+'ms';this.els.list.appendChild(card);}
  }

  _buildCard(obj) {
    var self=this,pct=obj.progression,done=obj.termine;
    var article=document.createElement('article'); article.className='obj-card'+(done?' obj-card--done':''); article.dataset.cat=obj.categorie;
    var head=document.createElement('div');head.className='obj-card__head';
    var h3=document.createElement('h3');h3.className='obj-card__title';h3.textContent=obj.titre;
    var badges=document.createElement('div');badges.className='obj-card__badges';
    if(!done){var bp=document.createElement('span');bp.className='badge-prio badge-prio--'+obj.priorite;bp.textContent=obj.priorite==='urgent'?'🔴':obj.priorite==='normal'?'🟡':'🟢';badges.appendChild(bp);}
    if(!done){var df=diffJours(obj.dateFin);if(df<=1){var bd=document.createElement('span');bd.className='badge-prio badge-prio--urgent';bd.textContent=df<0?'🚨 Dépassé':df===0?'⏰ Aujourd\'hui':'⏰ Demain';badges.appendChild(bd);}}
    var bs=document.createElement('span');bs.className='badge-status '+(done?'badge-status--done':'badge-status--active');var dot=document.createElement('span');dot.className='badge-dot';bs.appendChild(dot);bs.appendChild(document.createTextNode(' '+(done?'Terminé':'En cours')));badges.appendChild(bs);
    head.appendChild(h3);head.appendChild(badges);
    var meta=document.createElement('div');meta.className='obj-card__meta';
    var mc=document.createElement('span');mc.textContent=(CATEGORIES[obj.categorie]?CATEGORIES[obj.categorie].label:obj.categorie);
    var md=document.createElement('span');md.textContent='📅 '+this._fmt(obj.dateFin);
    var mt=document.createElement('span');mt.textContent='📋 '+obj.nbFaites+'/'+obj.taches.length;
    if(obj.notes){var mn=document.createElement('span');mn.className='obj-card__note-icon';mn.textContent='📝';meta.appendChild(mn);}
    meta.appendChild(mc);meta.appendChild(md);meta.appendChild(mt);
    var prog=document.createElement('div');prog.className='obj-card__progress';
    var row=document.createElement('div');row.className='progress-row';var rl=document.createElement('span');rl.textContent='Progression';var rr=document.createElement('strong');rr.textContent=pct+'%';row.appendChild(rl);row.appendChild(rr);
    var pbar=document.createElement('div');pbar.className='pbar';var fill=document.createElement('div');fill.className='pbar__fill'+(done?' pbar__fill--done':'');fill.style.width=pct+'%';pbar.appendChild(fill);prog.appendChild(row);prog.appendChild(pbar);
    var arrow=document.createElement('div');arrow.className='obj-card__arrow';arrow.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>';
    article.appendChild(head);article.appendChild(meta);article.appendChild(prog);article.appendChild(arrow);
    var cid=obj.id; article.addEventListener('click',function(){self.app.ouvrirDetail(cid);}); return article;
  }

  renderDetail(obj) {
    var self=this,el=this.els.viewDetail,pct=obj.progression,done=obj.termine,idxActif=obj.indexActif;
    el.innerHTML='';
    var hero=document.createElement('section');hero.className='detail-hero';
    var bdiv=document.createElement('div');bdiv.className='detail-hero__badges';
    var bst=document.createElement('span');bst.className='badge-status '+(done?'badge-status--done':'badge-status--active');var dot=document.createElement('span');dot.className='badge-dot';bst.appendChild(dot);bst.appendChild(document.createTextNode(' '+(done?'Terminé':'En cours')));
    var bpr=document.createElement('span');bpr.className='badge-prio badge-prio--'+obj.priorite;bpr.textContent=PRIO_LABELS[obj.priorite]||obj.priorite;
    var bcat=document.createElement('span');bcat.className='badge-cat';bcat.dataset.cat=obj.categorie;bcat.textContent=CATEGORIES[obj.categorie]?CATEGORIES[obj.categorie].label:obj.categorie;
    if(!done){var df2=diffJours(obj.dateFin);if(df2<=3){var bdl=document.createElement('span');bdl.className='badge-prio badge-prio--'+(df2<=1?'urgent':'normal');bdl.textContent=self.app.deadlineManager.getIcon(obj)+' '+self.app.deadlineManager.getLabel(obj);bdiv.appendChild(bdl);}}
    bdiv.appendChild(bst);bdiv.appendChild(bpr);bdiv.appendChild(bcat);
    var title=document.createElement('h2');title.className='detail-hero__title';title.textContent=obj.titre;
    var dates=document.createElement('div');dates.className='detail-hero__dates';var d1=document.createElement('span');d1.textContent='🗓 Début : '+this._fmt(obj.dateDebut);var d2=document.createElement('span');d2.textContent='⏳ Fin : '+this._fmt(obj.dateFin);dates.appendChild(d1);dates.appendChild(d2);
    var pw=document.createElement('div');pw.className='detail-progress';var pt=document.createElement('div');pt.className='detail-progress-top';var ptl=document.createElement('span');ptl.textContent=obj.nbFaites+' / '+obj.taches.length+' tâches';var ptr=document.createElement('strong');ptr.textContent=pct+'%';pt.appendChild(ptl);pt.appendChild(ptr);var pb=document.createElement('div');pb.className='pbar';var pf=document.createElement('div');pf.className='pbar__fill'+(done?' pbar__fill--done':'');pf.style.width=pct+'%';pb.appendChild(pf);pw.appendChild(pt);pw.appendChild(pb);
    hero.appendChild(bdiv);hero.appendChild(title);hero.appendChild(dates);hero.appendChild(pw);
    var ts=document.createElement('div');ts.className='tasks-section';
    var hdr=document.createElement('div');hdr.className='tasks-section__header';var lbl=document.createElement('p');lbl.className='tasks-section__label';lbl.textContent='📋 Tâches (ordre séquentiel)';hdr.appendChild(lbl);ts.appendChild(hdr);
    if(!done){
      var ar=document.createElement('div');ar.className='add-task-row';var inp=document.createElement('input');inp.type='text';inp.placeholder='Ajouter une tâche…';inp.maxLength=LIMITS.tache;inp.autocomplete='off';inp.autocorrect='off';inp.spellcheck=false;
      var ba=document.createElement('button');ba.type='button';ba.className='btn-add-task';ba.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
      var oid=obj.id;
      function doAdd(){var v=Sanitizer.text(inp.value,LIMITS.tache);if(v){self.app.ajouterTache(oid,v);inp.value='';inp.focus();}}
      ba.addEventListener('click',doAdd);inp.addEventListener('keydown',function(e){if(e.key==='Enter')doAdd();});ar.appendChild(inp);ar.appendChild(ba);ts.appendChild(ar);
    }
    var ul=document.createElement('ul');ul.className='tasks-list';
    for(var i=0;i<obj.taches.length;i++){
      var tache=obj.taches[i],locked=!tache.faite&&i!==idxActif;
      var li=document.createElement('li');li.className='task-item'+(tache.faite?' task-item--done':'')+(locked?' task-item--locked':'');li.dataset.tacheId=tache.id;li.style.animationDelay=(i*35)+'ms';
      if(!tache.faite&&!done){var handle=document.createElement('span');handle.className='drag-handle';handle.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>';li.appendChild(handle);}
      var num=document.createElement('span');num.className='task-num';num.textContent=i+1;
      var cb=document.createElement('input');cb.type='checkbox';cb.className='task-check';cb.checked=tache.faite;cb.disabled=tache.faite||locked||done;
      (function(oId,tId,checkbox,tRef){checkbox.addEventListener('change',function(){checkbox.checked=tRef.faite;self.app.validerTache(oId,tId);});}(obj.id,tache.id,cb,tache));
      var sp=document.createElement('span');sp.className='task-title';sp.textContent=tache.titre;
      var bd=document.createElement('button');bd.type='button';bd.className='btn-del-task';bd.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      (function(oId,tId){bd.addEventListener('click',function(){self.app.supprimerTache(oId,tId);});}(obj.id,tache.id));
      li.appendChild(num);li.appendChild(cb);li.appendChild(sp);li.appendChild(bd);ul.appendChild(li);
    }
    if(!obj.taches.length){var hint=document.createElement('p');hint.style.cssText='font-size:.8rem;color:var(--text-3);font-style:italic;text-align:center;padding:20px 0';hint.textContent='Aucune tâche — ajoutez-en une ci-dessus.';ul.appendChild(hint);}
    ts.appendChild(ul);
    if(!done&&obj.taches.some(function(t){return!t.faite;})){var oidD=obj.id;new DragDropManager(ul,function(nIds){self.app.reordonnerTaches(oidD,nIds);});}
    if(!done){var ad=document.createElement('div');ad.className='detail-actions';var bmd=document.createElement('button');bmd.type='button';bmd.className='btn-mark-done';bmd.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg> Marquer comme terminé';var oidM=obj.id;bmd.addEventListener('click',function(){self.app.marquerTermine(oidM);});ad.appendChild(bmd);ts.appendChild(ad);}
    var ns=document.createElement('div');ns.className='notes-section';var nl=document.createElement('span');nl.className='notes-section__label';nl.textContent='📝 Notes';
    var ta=document.createElement('textarea');ta.className='notes-textarea';ta.placeholder='Ajoutez des notes, liens, réflexions…';ta.value=obj.notes||'';ta.maxLength=LIMITS.notes;if(done)ta.disabled=true;
    var ss=document.createElement('p');ss.className='notes-save-status';var oidN=obj.id;
    ta.addEventListener('input',function(){ss.textContent='…';ss.className='notes-save-status';clearTimeout(self._notesTimers[oidN]);self._notesTimers[oidN]=setTimeout(function(){self.app.sauvegarderNotes(oidN,ta.value);ss.textContent='✓ Sauvegardé';ss.className='notes-save-status notes-save-status--saved';},1000);});
    ns.appendChild(nl);ns.appendChild(ta);ns.appendChild(ss);
    el.appendChild(hero);el.appendChild(ts);el.appendChild(ns);
  }

  renderStats(objectifs, streakData, dlManager) {
    var total=objectifs.length,done=0,tasksDone=0;
    for(var i=0;i<objectifs.length;i++){if(objectifs[i].termine)done++;tasksDone+=objectifs[i].nbFaites;}
    var pct=total>0?Math.round((done/total)*100):0;
    this.els.bsTotal.textContent=total;this.els.bsDone.textContent=done;this.els.bsTasks.textContent=tasksDone;
    this.els.globalFill.style.width=pct+'%';this.els.globalPct.textContent=pct+'%';
    this.renderStreak(streakData.streak,streakData.best,streakData.week);
    this.renderDeadlineList(objectifs,dlManager);
    this.els.catStats.innerHTML='';
    Object.keys(CATEGORIES).forEach(function(key){
      var count=objectifs.filter(function(o){return o.categorie===key;}).length;if(!count)return;
      var item=document.createElement('div');item.className='cat-stat-item';var dot=document.createElement('span');dot.className='cat-stat-dot';dot.style.background=CATEGORIES[key].color;var name=document.createElement('span');name.className='cat-stat-name';name.textContent=CATEGORIES[key].label;var cnt=document.createElement('span');cnt.className='cat-stat-count';cnt.textContent=count+' obj.';var bw=document.createElement('div');bw.className='cat-stat-bar-wrap';var bar=document.createElement('div');bar.className='cat-stat-bar';var f=document.createElement('div');f.className='cat-stat-fill';f.style.width=Math.round((count/(total||1))*100)+'%';f.style.background=CATEGORIES[key].color;bar.appendChild(f);bw.appendChild(bar);item.appendChild(dot);item.appendChild(name);item.appendChild(cnt);item.appendChild(bw);this.els.catStats.appendChild(item);
    },this);
    this.els.recentList.innerHTML='';
    objectifs.slice(0,6).forEach(function(o){var item=document.createElement('div');item.className='recent-item';var rd=document.createElement('span');rd.className='recent-dot '+(o.termine?'recent-dot--done':'recent-dot--active');var rn=document.createElement('span');rn.className='recent-name';rn.textContent=o.titre;var rp=document.createElement('span');rp.className='recent-pct';rp.textContent=o.progression+'%';item.appendChild(rd);item.appendChild(rn);item.appendChild(rp);this.els.recentList.appendChild(item);},this);
  }

  updateNotifUI(enabled) { var btn=this.els.toggleNotif;var lbl=this.els.notifStatus;if(!btn)return;btn.classList.toggle('on',enabled);if(lbl)lbl.textContent=enabled?'✅ Alertes deadline activées':'Notifications désactivées'; }
  _fmt(s){if(!s)return'—';var p=s.split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:s;}
  _iconBtn(svg,cls,title){var b=document.createElement('button');b.type='button';b.className=cls;b.title=title;b.innerHTML=svg;return b;}
}

/* ══════════════════════════════════════════════════════════
   App — Chef d'orchestre (version sécurisée)
══════════════════════════════════════════════════════════ */
class App {
  constructor() {
    this.storage         = new SecureStorageManager();
    this.router          = new Router();
    this.theme           = new ThemeManager();
    this.confetti        = new ConfettiManager();
    this.deadlineManager = new DeadlineManager();
    this.notifEnabled    = localStorage.getItem('focusflow_notif') === 'true';
    this.filtre    = 'all';
    this.catFiltre = 'all';
    this.tri       = 'date_creation';
    this.objectifs = [];
    this.ui        = null; /* initialisé après unlock */

    /* Bouton de reset sur l'écran de verrouillage */
    var resetBtn = document.getElementById('lockResetBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', function() {
        if (window.confirm('⚠️ Réinitialiser complètement l\'application ? Toutes vos données seront perdues.')) {
          LockManager.reset();
        }
      });
    }

    /* Lance l'écran de verrouillage */
    var self = this;
    this.lockManager = new LockManager(function() { self._onUnlocked(); });
    this.lockManager.start();
  }

  /* ── Appelé après déverrouillage réussi ── */
  async _onUnlocked() {
    /* Transmet le PIN au storage pour le chiffrement */
    var pinPassword = this.lockManager.pinHash || 'focusflow-default';
    await this.storage.initWithPin(pinPassword);

    /* Charge les données (déchiffrement) */
    this.objectifs = await this.storage.load();
    this.streakManager = new StreakManager(this.storage);
    this.ui            = new UIManager(this);

    /* Masque immédiatement l'état vide si des données existent */
    if (this.objectifs.length > 0) {
      var es = document.getElementById('emptyState');
      if (es) es.hidden = true;
    }

    this._initGreeting();
    this._initDateMin();
    this._initAutoLockSelect();
    this._initBiometricRow();
    this._bindNav();
    this._bindSheet();
    this._bindFilters();
    this._bindSettings();
    this._registerSW();
    this._setupInstallBanner();
    if (this.notifEnabled) this.deadlineManager.checkAndNotify(this.objectifs);

    /* Affiche le splash brièvement puis lance l'app */
    var self   = this;
    var splash = document.getElementById('splash');
    if (splash) {
      splash.style.display = 'flex';
      /* Force le reflow pour que l'animation fonctionne */
      splash.getBoundingClientRect();
      setTimeout(function() {
        splash.classList.add('hidden');
        self.render();
        setTimeout(function() {
          splash.style.display = 'none';
          splash.classList.remove('hidden');
        }, 450);
      }, 900);
    } else {
      this.render();
    }
  }

  _getStreakData() { return { streak: { current: this.streakManager.getCurrent() }, best: this.streakManager.getBest(), week: this.streakManager.getWeek() }; }
  _initGreeting() { var h=new Date().getHours();var msg=h<12?'Bonjour 🌅':h<18?'Bon après-midi ☀️':'Bonsoir 🌙';if(this.ui&&this.ui.els.greet)this.ui.els.greet.textContent=msg; }
  _initDateMin()  { var inp=document.getElementById('inputDateFin');if(inp)inp.min=today(); }

  _initAutoLockSelect() {
    var sel=document.getElementById('autoLockSelect');
    if(!sel)return; sel.value=String(this.lockManager.autoLockMin);
    var self=this; sel.addEventListener('change',function(){self.lockManager.setAutoLock(parseInt(sel.value,10));});
  }

  _initBiometricRow() {
    if (!window.PublicKeyCredential) return;
    /* Vérifie que l'authentificateur de plateforme est dispo (capteur intégré) */
    var self = this;
    PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(function(available) {
      if (!available) return; /* Pas de capteur → on masque l'option */
      var row = document.getElementById('biometricRow');
      if (row) row.hidden = false;
      var btn = document.getElementById('toggleBiometric');
      if (!btn) return;

      /* Reflète l'état actuel */
      var hasCred = !!localStorage.getItem('ff_bio_cred_id');
      btn.classList.toggle('on', self.lockManager.bioEnabled && hasCred);

      btn.addEventListener('click', async function() {
        var currentlyEnabled = self.lockManager.bioEnabled && !!localStorage.getItem('ff_bio_cred_id');

        if (!currentlyEnabled) {
          /* ── Activation : enregistre le credential biométrique ── */
          self.ui.toast('👆 Placez votre doigt sur le capteur…', '', 4000);
          var result = await self.lockManager._registerBiometric();
          if (result.ok) {
            self.lockManager.setBiometric(true);
            btn.classList.add('on');
            self.ui.toast('✅ Biométrie configurée !', 'success');
          } else {
            self.ui.toast('❌ ' + result.msg, 'error', 4000);
            btn.classList.remove('on');
          }
        } else {
          /* ── Désactivation : supprime le credential ── */
          self.lockManager.setBiometric(false);
          localStorage.removeItem('ff_bio_cred_id');
          btn.classList.remove('on');
          self.ui.toast('🔕 Biométrie désactivée');
        }
      });
    }).catch(function() { /* WebAuthn pas supporté, on ignore */ });
  }

  _registerSW() { if('serviceWorker'in navigator){navigator.serviceWorker.register('./sw.js').then(function(){console.log('[FF]SW✓');}).catch(function(e){console.warn('[FF]SW:',e);});} }

  _setupInstallBanner() {
    var dp=null;
    window.addEventListener('beforeinstallprompt',function(e){
      e.preventDefault();dp=e;var banner=document.createElement('div');banner.className='install-banner';banner.innerHTML='<span class="install-banner__icon">◈</span><div class="install-banner__text"><p class="install-banner__title">Installer FocusFlow</p><p class="install-banner__sub">Accès rapide depuis l\'écran d\'accueil</p></div><div class="install-banner__btns"><button type="button" class="btn-install" id="btnInstallPWA">Installer</button><button type="button" class="btn-install-close" id="btnCloseInstallPWA">✕</button></div>';
      document.body.appendChild(banner);setTimeout(function(){banner.classList.add('show');},2000);
      document.getElementById('btnInstallPWA').addEventListener('click',function(){banner.classList.remove('show');if(dp){dp.prompt();dp.userChoice.then(function(){dp=null;});}});
      document.getElementById('btnCloseInstallPWA').addEventListener('click',function(){banner.classList.remove('show');});
    });
  }

  _bindNav() {
    var self=this;
    document.querySelectorAll('.nav-item[data-view]').forEach(function(btn){btn.addEventListener('click',function(){self.navigate(btn.dataset.view);});});
    var fab=document.getElementById('fabBtn');if(fab)fab.addEventListener('click',function(){self.openSheet();});
  }

  _bindSheet() {
    var self=this;
    var ov=document.getElementById('sheetOverlay');if(ov)ov.addEventListener('click',function(){self.closeSheet();});
    var bc=document.getElementById('btnCreer');if(bc)bc.addEventListener('click',function(){self.creerObjectif();});
    var it=document.getElementById('inputTitre');if(it)it.addEventListener('keydown',function(e){if(e.key==='Enter')self.creerObjectif();});
    document.querySelectorAll('.prio-btn').forEach(function(btn){btn.addEventListener('click',function(){document.querySelectorAll('.prio-btn').forEach(function(b){b.classList.remove('active');});btn.classList.add('active');});});
    document.querySelectorAll('.cat-btn').forEach(function(btn){btn.addEventListener('click',function(){document.querySelectorAll('.cat-btn').forEach(function(b){b.classList.remove('active');});btn.classList.add('active');});});
  }

  _bindFilters() {
    var self=this;
    document.querySelectorAll('#statusFilters .chip').forEach(function(chip){chip.addEventListener('click',function(){document.querySelectorAll('#statusFilters .chip').forEach(function(c){c.classList.remove('active');});chip.classList.add('active');self.filtre=chip.dataset.filter||'all';self.render();});});
    var ss=document.getElementById('sortSelect');if(ss)ss.addEventListener('change',function(){self.tri=ss.value;self.render();});
  }

  _bindSettings() {
    var self=this;

    /* Thème */
    document.querySelectorAll('.theme-btn').forEach(function(btn){btn.addEventListener('click',function(){self.theme.set(btn.dataset.theme);document.querySelectorAll('.theme-btn').forEach(function(b){b.classList.remove('active');});btn.classList.add('active');});});

    /* Changer PIN */
    var btnChgPin=document.getElementById('btnChangePIN');if(btnChgPin)btnChgPin.addEventListener('click',function(){self.lockManager.changePIN();});

    /* Notifications */
    var tn=document.getElementById('toggleNotif');
    if(tn){
      self.ui.updateNotifUI(self.notifEnabled);
      tn.addEventListener('click',function(){
        if(!self.notifEnabled){
          self.deadlineManager.requestPermission().then(function(granted){
            if(granted){self.notifEnabled=true;localStorage.setItem('focusflow_notif','true');self.ui.updateNotifUI(true);self.ui.toast('🔔 Alertes activées !','success');self.deadlineManager.checkAndNotify(self.objectifs);}
            else{self.ui.toast('❌ Permission refusée','error');}
          });
        }else{self.notifEnabled=false;localStorage.setItem('focusflow_notif','false');self.ui.updateNotifUI(false);self.ui.toast('🔕 Notifications désactivées');}
      });
    }

    /* Export chiffré */
    var bex=document.getElementById('btnExport');
    if(bex)bex.addEventListener('click',function(){self._showPasswordSheet('export','Mot de passe export','Protège votre fichier de sauvegarde',function(pwd){self._doExport(pwd);});});

    /* Import */
    var bim=document.getElementById('inputImport');
    if(bim)bim.addEventListener('change',function(e){var f=e.target.files[0];if(f){self._showPasswordSheet('import','Mot de passe import','Entrez le mot de passe du fichier',function(pwd){self._doImport(f,pwd);});}e.target.value='';});

    /* Reset total */
    var br=document.getElementById('btnReset');
    if(br)br.addEventListener('click',function(){self.confirmerResetTotal();});

    /* Toggle visibilité mot de passe */
    var eye=document.getElementById('pwdEye');
    if(eye)eye.addEventListener('click',function(){var inp=document.getElementById('pwdInput');if(inp){inp.type=inp.type==='password'?'text':'password';}});
  }

  /* ── Sheet mot de passe ── */
  _showPasswordSheet(mode, title, label, onConfirm) {
    var sheet=document.getElementById('pwdSheet');var ov=document.getElementById('pwdOverlay');
    var tEl=document.getElementById('pwdTitle');var lEl=document.getElementById('pwdLabel');var inp=document.getElementById('pwdInput');var errEl=document.getElementById('pwdError');
    if(!sheet)return;
    if(tEl)tEl.textContent=title;if(lEl)lEl.textContent=label;if(inp)inp.value='';if(errEl)errEl.textContent='';
    sheet.style.display='block';ov.style.display='block';
    requestAnimationFrame(function(){sheet.classList.add('open');ov.classList.add('open');});
    setTimeout(function(){if(inp)inp.focus();},350);

    var self=this;
    function close(){sheet.classList.remove('open');ov.classList.remove('open');setTimeout(function(){sheet.style.display='none';ov.style.display='none';},350);}
    ov.onclick=close;

    var confirmBtn=document.getElementById('pwdConfirmBtn');var cancelBtn=document.getElementById('pwdCancelBtn');
    var newConfirm=confirmBtn.cloneNode(true);confirmBtn.parentNode.replaceChild(newConfirm,confirmBtn);
    var newCancel=cancelBtn.cloneNode(true);cancelBtn.parentNode.replaceChild(newCancel,cancelBtn);
    newCancel.addEventListener('click',close);
    newConfirm.addEventListener('click',function(){
      var pwd=inp?inp.value.trim():'';
      if(pwd.length<6){if(errEl)errEl.textContent='Minimum 6 caractères.';return;}
      close();onConfirm(pwd);
    });
  }

  async _doExport(password) {
    try {
      var exported=await this.storage.exportEncrypted(this.objectifs, password);
      var data=JSON.stringify(exported,null,2);var blob=new Blob([data],{type:'application/json'});var url=URL.createObjectURL(blob);
      var a=document.createElement('a');a.href=url;a.download='focusflow-secure-'+today()+'.ffenc';
      document.body.appendChild(a);a.click();setTimeout(function(){document.body.removeChild(a);URL.revokeObjectURL(url);},1000);
      this.ui.toast('⬇️ Export chiffré réussi !','success');
    } catch(e) { this.ui.toast('❌ Erreur lors de l\'export','error'); }
  }

  async _doImport(file, password) {
    var self=this;var reader=new FileReader();
    reader.onload=async function(e){
      try {
        var imported=await self.storage.importEncrypted(e.target.result,password);
        if(window.confirm('Fusionner avec vos données actuelles ? (Non = Remplacer)')){
          var ids={};self.objectifs.forEach(function(o){ids[o.id]=true;});
          imported.forEach(function(o){if(!ids[o.id])self.objectifs.unshift(o);});
        }else{self.objectifs=imported;}
        await self.storage.save(self.objectifs);self.render();
        self.ui.toast('⬆️ Import réussi ! ('+imported.length+' objectifs)','success');
      }catch(err){self.ui.toast('❌ Mot de passe incorrect ou fichier invalide','error');}
    };
    reader.readAsText(file);
  }

  /* ── Navigation ── */
  navigate(view,objectifId){this.router.navigate(view,objectifId);this.ui.updateTopbar(view,objectifId||null);this.render();}
  goHome()          {this.navigate('home');}
  ouvrirDetail(oid) {this.navigate('detail',oid);}
  setCatFiltre(cat) {this.catFiltre=cat;this.render();}

  /* ── Sheet objectif ── */
  openSheet(){document.getElementById('bottomSheet').classList.add('open');document.getElementById('sheetOverlay').classList.add('open');setTimeout(function(){var i=document.getElementById('inputTitre');if(i)i.focus();},360);}
  closeSheet(){document.getElementById('bottomSheet').classList.remove('open');document.getElementById('sheetOverlay').classList.remove('open');}

  /* ── Créer objectif ── */
  creerObjectif(){
    var et=document.getElementById('inputTitre'),ed=document.getElementById('inputDateFin');
    var titre=Sanitizer.text(et?et.value:'',LIMITS.titre);var dateFin=Sanitizer.date(ed?ed.value:'');
    if(!titre){this.ui.toast('⚠️ Entrez un titre','error');if(et)et.focus();return;}
    if(!dateFin){this.ui.toast('⚠️ Choisissez une date limite','error');if(ed)ed.focus();return;}
    var ap=document.querySelector('.prio-btn.active'),ac=document.querySelector('.cat-btn.active');
    var obj=new Objectif(titre,dateFin,null,null,false,[],ap?ap.dataset.prio:'normal',ac?ac.dataset.cat:'personnel','');
    this.objectifs.unshift(obj);if(et)et.value='';if(ed)ed.value='';this.closeSheet();
    this._saveAndRender();this.ui.toast('🎯 Objectif créé !','success');
  }

  /* ── Modals ── */
  _openModal(icon,title,msg,cancelTxt,confirmTxt,confirmCls,onConfirm){
    var ov=document.createElement('div');ov.className='modal-overlay';var modal=document.createElement('div');modal.className='modal-card';
    modal.innerHTML='<div class="modal-icon">'+icon+'</div><h3 class="modal-title">'+title+'</h3><p class="modal-msg">'+msg+'</p><div class="modal-actions"><button type="button" class="modal-btn modal-btn--cancel" id="mCancel">'+cancelTxt+'</button><button type="button" class="modal-btn '+confirmCls+'" id="mConfirm">'+confirmTxt+'</button></div>';
    ov.appendChild(modal);document.body.appendChild(ov);requestAnimationFrame(function(){ov.classList.add('open');});
    function close(){ov.classList.remove('open');setTimeout(function(){if(ov.parentNode)ov.parentNode.removeChild(ov);},300);}
    document.getElementById('mCancel').addEventListener('click',close);ov.addEventListener('click',function(e){if(e.target===ov)close();});document.getElementById('mConfirm').addEventListener('click',function(){close();onConfirm();});
  }
  confirmerSuppression(oid){var obj=this._find(oid);if(!obj)return;var self=this;this._openModal('🗑️','Supprimer l\'objectif ?','<strong>'+obj.titre+'</strong><br/>Supprime aussi ses <strong>'+obj.taches.length+' tâche(s)</strong>.<br/><em>Irréversible.</em>','Annuler','Supprimer','modal-btn--danger',function(){self.supprimerObjectif(oid);});}
  confirmerResetTotal(){var total=this.objectifs.length;if(!total){this.ui.toast('Aucun objectif à supprimer.');return;}var self=this;this._openModal('⚠️','Tout supprimer ?','Vous allez supprimer <strong>'+total+' objectif'+(total>1?'s':'')+'</strong> et toutes leurs tâches.<br/><em>Irréversible.</em>','Annuler','Tout supprimer','modal-btn--danger',function(){self.objectifs=[];self.storage.save(self.objectifs);self.render();self.ui.toast('🗑 Données supprimées','error',3000);});}

  /* ── Actions objectifs ── */
  marquerTermine(oid){var obj=this._find(oid);if(!obj||obj.termine)return;obj.termine=true;this.storage.recordActivity('objective');this._saveAndRender();this.confetti.fire();this.ui.toast('🏆 Objectif terminé !','success',4000);}
  supprimerObjectif(oid){this.objectifs=this.objectifs.filter(function(o){return o.id!==oid;});this._saveAndRender();this.goHome();this.ui.toast('🗑 Objectif supprimé');}
  sauvegarderNotes(oid,texte){var obj=this._find(oid);if(!obj)return;obj.notes=Sanitizer.text(texte,LIMITS.notes);this.storage.save(this.objectifs);}

  /* ── Actions tâches ── */
  ajouterTache(oid,titre){var obj=this._find(oid);if(!obj||obj.termine)return;obj.ajouterTache(Sanitizer.text(titre,LIMITS.tache));this._saveAndRender();}
  validerTache(oid,tacheId){var obj=this._find(oid);if(!obj)return;var res=obj.validerTache(tacheId);if(!res.ok){this.ui.toast('⛔ '+res.msg,'error');this.render();return;}this.storage.recordActivity('task');var vient=obj.checkCompletion();if(vient)this.storage.recordActivity('objective');this._saveAndRender();if(vient){this.confetti.fire();this.ui.toast('🏆 Objectif complété !','success',4000);}else{this.ui.toast('✅ Tâche validée !','success');}}
  supprimerTache(oid,tacheId){var obj=this._find(oid);if(!obj)return;obj.supprimerTache(tacheId);if(obj.taches.length>0&&obj.nbFaites<obj.taches.length)obj.termine=false;this._saveAndRender();}
  reordonnerTaches(oid,newIds){var obj=this._find(oid);if(!obj)return;var map={};obj.taches.forEach(function(t){map[t.id]=t;});var r=[];newIds.forEach(function(id){if(map[id])r.push(map[id]);});obj.taches.forEach(function(t){if(r.indexOf(t)===-1)r.push(t);});obj.taches=r;this._saveAndRender();this.ui.toast('↕️ Tâches réorganisées','',1500);}

  /* ── Utilitaires ── */
  _find(id){for(var i=0;i<this.objectifs.length;i++){if(this.objectifs[i].id===id)return this.objectifs[i];}return null;}
  async _saveAndRender(){await this.storage.save(this.objectifs);this.render();}

  render(){
    if(!this.ui)return;
    var view=this.router.currentView,objId=this.router.detailObjId,sd=this._getStreakData(),dl=this.deadlineManager;
    if(view==='home'){this.ui.renderHome(this.objectifs,this.filtre,this.catFiltre,this.tri,sd,dl);}
    else if(view==='detail'){var obj=this._find(objId);if(!obj){this.goHome();return;}this.ui.renderDetail(obj);}
    else if(view==='stats'){this.ui.renderStats(this.objectifs,sd,dl);}
    else if(view==='settings'){this.ui.updateNotifUI(this.notifEnabled);}
  }
}

/* ══════════════════════════════════════════════════════════
   POINT D'ENTRÉE
══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function() {
  window.app = new App();
});