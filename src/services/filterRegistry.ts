import { BUILTIN_CATEGORIES, BUILTIN_FILTERS, NONE_FILTER } from '../data/builtinFilters';
import { FilterCategory, FilterPreset, FilterUserSettings } from '../types/filter';

const DB_NAME = 'chup_ne_db';
const DB_VERSION = 1;

type Listener = () => void;

class FilterRegistry {
  private customFilters: Map<string, FilterPreset> = new Map();
  private customCategories: FilterCategory[] = [];
  private userSettings: FilterUserSettings = {
    version: 1,
    favorites: ['portra400', 'tealandorange', 'softskin', 'clarendon', 'cinestill800t'],
    hidden: [],
    recentlyUsed: ['portra400'],
    filterOrder: [],
    categoryOrder: [],
    overrides: {},
  };
  private isInitialized = false;
  private listeners: Set<Listener> = new Set();
  private db: IDBDatabase | null = null;

  constructor() {
    this.init();
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  public async init(): Promise<void> {
    if (this.isInitialized) return;
    try {
      this.db = await this.openDatabase();
      await this.loadFromStorage();
      this.isInitialized = true;
      this.notify();
    } catch (err) {
      console.warn('IndexedDB unavailable, using memory fallback:', err);
      this.isInitialized = true;
      this.notify();
    }
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB not supported'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('custom_filters')) {
          db.createObjectStore('custom_filters', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('user_settings')) {
          db.createObjectStore('user_settings', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('custom_categories')) {
          db.createObjectStore('custom_categories', { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async loadFromStorage(): Promise<void> {
    if (!this.db) return;

    // Load custom filters
    try {
      const filters = await this.getAllFromStore<FilterPreset>('custom_filters');
      this.customFilters.clear();
      for (const f of filters) {
        if (this.validateFilter(f)) {
          this.customFilters.set(f.id, f);
        } else {
          console.warn('Skipping invalid custom filter:', f);
        }
      }
    } catch (err) {
      console.warn('Failed to load custom filters:', err);
    }

    // Load categories
    try {
      const cats = await this.getAllFromStore<FilterCategory>('custom_categories');
      this.customCategories = cats;
    } catch (err) {
      console.warn('Failed to load custom categories:', err);
    }

    // Load user settings
    try {
      const settings = await this.getOneFromStore<{ key: string; value: FilterUserSettings }>(
        'user_settings',
        'settings'
      );
      if (settings && settings.value) {
        this.userSettings = {
          ...this.userSettings,
          ...settings.value,
        };
      }
    } catch (err) {
      console.warn('Failed to load user settings:', err);
    }
  }

  private validateFilter(filter: unknown): filter is FilterPreset {
    if (!filter || typeof filter !== 'object') return false;
    const f = filter as Partial<FilterPreset>;
    return (
      typeof f.id === 'string' &&
      typeof f.name === 'string' &&
      typeof f.category === 'string' &&
      f.params !== undefined
    );
  }

  private async saveSettings(): Promise<void> {
    if (!this.db) return;
    try {
      const tx = this.db.transaction('user_settings', 'readwrite');
      const store = tx.objectStore('user_settings');
      store.put({ key: 'settings', value: this.userSettings });
    } catch (err) {
      console.warn('Failed to save settings:', err);
    }
  }

  private getAllFromStore<T>(storeName: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve([]);
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  private getOneFromStore<T>(storeName: string, key: string): Promise<T | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve(null);
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  // ─────────────────────────────────────────────────────────────
  // PUBLIC READ METHODS
  // ─────────────────────────────────────────────────────────────

  public getRawBuiltins(): FilterPreset[] {
    return BUILTIN_FILTERS;
  }

  public getCategories(): FilterCategory[] {
    const builtinIds = new Set(BUILTIN_CATEGORIES.map((c) => c.id));
    const merged = [...BUILTIN_CATEGORIES];
    for (const c of this.customCategories) {
      if (!builtinIds.has(c.id)) {
        merged.push(c);
      }
    }
    return merged;
  }

  public getFilterById(id: string): FilterPreset | undefined {
    if (id === 'none') return NONE_FILTER;
    if (this.customFilters.has(id)) {
      return this.customFilters.get(id);
    }
    const builtin = BUILTIN_FILTERS.find((b) => b.id === id);
    if (!builtin) return undefined;

    // Apply any user override diff
    const override = this.userSettings.overrides[id];
    if (override) {
      return {
        ...builtin,
        ...override,
        params: { ...builtin.params, ...(override.params || {}) },
      };
    }
    return builtin;
  }

  /**
   * Returns all active filters (Builtin + Custom), merged with overrides,
   * sorted by user preferences. 'none' filter is always placed first.
   */
  public getAllFilters(includeHidden: boolean = false): FilterPreset[] {
    const filters: FilterPreset[] = [];

    // Builtins with overrides applied
    for (const b of BUILTIN_FILTERS) {
      const isHidden = this.userSettings.hidden.includes(b.id);
      if (!includeHidden && isHidden) continue;

      const override = this.userSettings.overrides[b.id];
      if (override) {
        filters.push({
          ...b,
          ...override,
          params: { ...b.params, ...(override.params || {}) },
        });
      } else {
        filters.push(b);
      }
    }

    // Customs
    for (const c of this.customFilters.values()) {
      const isHidden = this.userSettings.hidden.includes(c.id);
      if (!includeHidden && isHidden) continue;
      filters.push(c);
    }

    // Apply custom order if set
    if (this.userSettings.filterOrder.length > 0) {
      const orderMap = new Map<string, number>();
      this.userSettings.filterOrder.forEach((id, idx) => orderMap.set(id, idx));
      filters.sort((a, b) => {
        const orderA = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999;
        const orderB = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999;
        return orderA - orderB;
      });
    }

    // 'none' filter is strictly at the top
    return [NONE_FILTER, ...filters];
  }

  public getFavorites(): string[] {
    return [...this.userSettings.favorites];
  }

  public isFavorite(id: string): boolean {
    return this.userSettings.favorites.includes(id);
  }

  public isHidden(id: string): boolean {
    return this.userSettings.hidden.includes(id);
  }

  public getRecentlyUsed(): string[] {
    return [...this.userSettings.recentlyUsed];
  }

  // ─────────────────────────────────────────────────────────────
  // PUBLIC WRITE / MUTATION METHODS
  // ─────────────────────────────────────────────────────────────

  public async toggleFavorite(id: string): Promise<boolean> {
    const idx = this.userSettings.favorites.indexOf(id);
    let fav = false;
    if (idx >= 0) {
      this.userSettings.favorites.splice(idx, 1);
    } else {
      this.userSettings.favorites.push(id);
      fav = true;
    }
    await this.saveSettings();
    this.notify();
    return fav;
  }

  public async toggleHidden(id: string): Promise<boolean> {
    const idx = this.userSettings.hidden.indexOf(id);
    let hidden = false;
    if (idx >= 0) {
      this.userSettings.hidden.splice(idx, 1);
    } else {
      this.userSettings.hidden.push(id);
      hidden = true;
    }
    await this.saveSettings();
    this.notify();
    return hidden;
  }

  public async recordRecent(id: string): Promise<void> {
    if (id === 'none') return;
    const list = this.userSettings.recentlyUsed.filter((item) => item !== id);
    list.unshift(id);
    this.userSettings.recentlyUsed = list.slice(0, 15);
    await this.saveSettings();
    this.notify();
  }

  public async reorderFilters(newOrderIds: string[]): Promise<void> {
    this.userSettings.filterOrder = newOrderIds;
    await this.saveSettings();
    this.notify();
  }

  public async saveCustomFilter(filter: FilterPreset): Promise<void> {
    this.customFilters.set(filter.id, filter);
    if (this.db) {
      const tx = this.db.transaction('custom_filters', 'readwrite');
      tx.objectStore('custom_filters').put(filter);
    }
    this.notify();
  }

  public async deleteCustomFilter(id: string): Promise<FilterPreset | null> {
    const target = this.customFilters.get(id);
    if (!target) return null;

    this.customFilters.delete(id);
    if (this.db) {
      const tx = this.db.transaction('custom_filters', 'readwrite');
      tx.objectStore('custom_filters').delete(id);
    }
    // Remove from favorites / recents / order
    this.userSettings.favorites = this.userSettings.favorites.filter((x) => x !== id);
    this.userSettings.recentlyUsed = this.userSettings.recentlyUsed.filter((x) => x !== id);
    this.userSettings.filterOrder = this.userSettings.filterOrder.filter((x) => x !== id);
    await this.saveSettings();

    this.notify();
    return target;
  }

  public async updateBuiltinOverride(id: string, override: Partial<FilterPreset>): Promise<void> {
    this.userSettings.overrides[id] = {
      ...(this.userSettings.overrides[id] || {}),
      ...override,
    };
    await this.saveSettings();
    this.notify();
  }

  public async restoreBuiltinDefaults(id?: string): Promise<void> {
    if (id) {
      delete this.userSettings.overrides[id];
      this.userSettings.hidden = this.userSettings.hidden.filter((x) => x !== id);
    } else {
      this.userSettings.overrides = {};
      this.userSettings.hidden = [];
      this.userSettings.filterOrder = [];
    }
    await this.saveSettings();
    this.notify();
  }

  // Categories
  public async addCategory(name: string): Promise<FilterCategory> {
    const id = `cat_${Date.now()}`;
    const category: FilterCategory = { id, name };
    this.customCategories.push(category);
    if (this.db) {
      const tx = this.db.transaction('custom_categories', 'readwrite');
      tx.objectStore('custom_categories').put(category);
    }
    this.notify();
    return category;
  }

  public async deleteCategory(id: string): Promise<void> {
    this.customCategories = this.customCategories.filter((c) => c.id !== id);
    if (this.db) {
      const tx = this.db.transaction('custom_categories', 'readwrite');
      tx.objectStore('custom_categories').delete(id);
    }
    this.notify();
  }

  // Export / Import
  public exportFilterJSON(id: string): string {
    const filter = this.getFilterById(id);
    if (!filter) throw new Error('Filter không tồn tại');
    return JSON.stringify(filter, null, 2);
  }

  public exportAllJSON(): string {
    const all = this.getAllFilters(true).filter((f) => f.id !== 'none');
    const bundle = {
      app: 'Chụp Nè',
      version: 1,
      exportedAt: new Date().toISOString(),
      filters: all,
    };
    return JSON.stringify(bundle, null, 2);
  }

  public async importJSON(
    jsonStr: string,
    collisionMode: 'skip' | 'overwrite' | 'clone' = 'clone'
  ): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const result = { imported: 0, skipped: 0, errors: [] as string[] };
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      result.errors.push('Định dạng JSON không hợp lệ');
      return result;
    }

    let filtersToImport: FilterPreset[] = [];
    if (Array.isArray(parsed)) {
      filtersToImport = parsed;
    } else if (parsed && typeof parsed === 'object') {
      const p = parsed as { filters?: FilterPreset[] };
      if (Array.isArray(p.filters)) {
        filtersToImport = p.filters;
      } else if (this.validateFilter(parsed)) {
        filtersToImport = [parsed as FilterPreset];
      }
    }

    if (!filtersToImport.length) {
      result.errors.push('Không tìm thấy filter hợp lệ trong file');
      return result;
    }

    for (const f of filtersToImport) {
      if (!this.validateFilter(f)) {
        result.skipped++;
        continue;
      }

      const existing = this.getFilterById(f.id);
      if (existing) {
        if (collisionMode === 'skip') {
          result.skipped++;
          continue;
        } else if (collisionMode === 'clone') {
          f.id = `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          f.name = `${f.name} (Bản sao)`;
          f.type = 'custom';
        }
      }

      f.type = 'custom'; // Imported filters are always marked as custom
      await this.saveCustomFilter(f);
      result.imported++;
    }

    this.notify();
    return result;
  }
}

// Singleton instance
export const filterRegistry = new FilterRegistry();
