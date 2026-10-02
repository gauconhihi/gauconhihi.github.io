// vault.js — AES-GCM 256 key vault. Passphrase never stored. WebCrypto only.
const enc = new TextEncoder();
const dec = new TextDecoder();

export const HAS_CRYPTO = !!(globalThis.crypto?.subtle);

const MAGIC = 'gauconhihi.vault.v1';

export class Vault {
  #meta = null;      // {salt, iters, check} stored plaintext so we can verify passphrase
  #key = null;       // CryptoKey | null
  #data = null;      // {keys:{[providerId]:apiKey}, notes:...}

  constructor(storage) {
    this.storage = storage;
    const raw = storage.getItem(MAGIC);
    if (raw) { try { this.#meta = JSON.parse(raw); } catch { this.#meta = null; } }
  }

  get exists() { return !!this.#meta; }
  get unlocked() { return !!this.#key; }

  async #derive(pass) {
    const salt = new Uint8Array(this.#meta.salt);
    const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: this.#meta.iters, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
    );
  }

  // create a brand-new vault; destroys any previous one (caller must confirm)
  async create(pass) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    this.#meta = { salt: [...salt], iters: 310000, check: null };
    this.#key = await this.#derive(pass);
    this.#data = { keys: {} };
    const check = await this.seal('gauconhihi');
    this.#meta.check = check;
    this.storage.setItem(MAGIC, JSON.stringify(this.#meta));
    return true;
  }

  async unlock(pass) {
    if (!this.#meta) return this.create(pass);
    const key = await this.#derive(pass);
    try {
      const probe = await this.openWith(key, this.#meta.check);
      if (probe !== 'gauconhihi') throw new Error('probe mismatch');
    } catch {
      return false;                       // wrong passphrase
    }
    this.#key = key;
    this.#data = await this.#openAll();
    return true;
  }

  lock() { this.#key = null; this.#data = null; }

  async #openAll() {
    const raw = this.storage.getItem(MAGIC + '.data');
    if (!raw) return { keys: {} };
    try { return JSON.parse(await this.openWith(this.#key, JSON.parse(raw))); }
    catch { return { keys: {} }; }
  }

  async seal(plain) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.#key, enc.encode(plain));
    return { iv: [...iv], ct: [...new Uint8Array(ct)] };
  }

  async openWith(key, sealed) {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(sealed.iv) }, key, new Uint8Array(sealed.ct));
    return dec.decode(pt);
  }

  // ---- key API (only usable while unlocked) ----
  setKey(providerId, apiKey) {
    if (!this.unlocked) throw new Error('vault locked');
    this.#data.keys[providerId] = apiKey;
    this.#persist();
  }
  getKey(providerId) {
    if (!this.unlocked) return '';
    return this.#data.keys[providerId] || '';
  }
  listKeys() { return this.unlocked ? Object.keys(this.#data.keys) : []; }
  delKey(providerId) {
    if (!this.unlocked) return;
    delete this.#data.keys[providerId];
    this.#persist();
  }

  async #persist() {
    if (!this.unlocked) return;
    const sealed = await this.seal(JSON.stringify(this.#data));
    this.storage.setItem(MAGIC + '.data', JSON.stringify(sealed));
  }

  // export encrypted blob for backup / device move
  exportBlob() {
    return JSON.stringify({
      meta: this.#meta,
      data: this.storage.getItem(MAGIC + '.data'),
    });
  }

  async importBlob(json) {
    const o = typeof json === 'string' ? JSON.parse(json) : json;
    if (!o?.meta?.check) throw new Error('blob không hợp lệ');
    this.storage.setItem(MAGIC, JSON.stringify(o.meta));
    if (o.data) this.storage.setItem(MAGIC + '.data', o.data);
    this.#meta = o.meta;
    this.#key = null; this.#data = null;
  }

  destroy() {
    this.storage.removeItem(MAGIC);
    this.storage.removeItem(MAGIC + '.data');
    this.#meta = null; this.#key = null; this.#data = null;
  }
}