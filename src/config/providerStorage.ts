/**
 * Provider Storage Utility
 * Manages multiple RPC provider credentials
 */

export interface ProviderConfig {
    key?: string;
    endpoint?: string;  // For QuickNode
    token?: string;     // For QuickNode
}

export interface ProvidersStore {
    alchemy?: ProviderConfig;
    infura?: ProviderConfig;
    ankr?: ProviderConfig;
    quicknode?: ProviderConfig;
}

const PROVIDERS_KEY = 'pelz_providers';
const ACTIVE_PROVIDER_KEY = 'pelz_active_provider';

/**
 * Get all stored providers
 */
export function getStoredProviders(): ProvidersStore {
    try {
        const data = localStorage.getItem(PROVIDERS_KEY);
        return data ? JSON.parse(data) : {};
    } catch {
        return {};
    }
}

/**
 * Save providers store
 */
export function saveProviders(providers: ProvidersStore): void {
    localStorage.setItem(PROVIDERS_KEY, JSON.stringify(providers));
}

/**
 * Add a provider
 */
export function addProvider(name: string, config: ProviderConfig): void {
    const providers = getStoredProviders();
    providers[name as keyof ProvidersStore] = config;
    saveProviders(providers);
}

/**
 * Remove a provider
 */
export function removeProvider(name: string): boolean {
    const providers = getStoredProviders();
    if (providers[name as keyof ProvidersStore]) {
        delete providers[name as keyof ProvidersStore];
        saveProviders(providers);

        // If removing active provider, clear active
        if (getActiveProvider() === name) {
            setActiveProvider('');
        }
        return true;
    }
    return false;
}

/**
 * Get active provider name
 */
export function getActiveProvider(): string {
    return localStorage.getItem(ACTIVE_PROVIDER_KEY) || '';
}

/**
 * Set active provider
 */
export function setActiveProvider(name: string): boolean {
    if (!name) {
        localStorage.removeItem(ACTIVE_PROVIDER_KEY);
        return true;
    }

    const providers = getStoredProviders();
    if (providers[name as keyof ProvidersStore]) {
        localStorage.setItem(ACTIVE_PROVIDER_KEY, name);
        return true;
    }
    return false;
}

/**
 * Get provider config by name
 */
export function getProviderConfig(name: string): ProviderConfig | undefined {
    const providers = getStoredProviders();
    return providers[name as keyof ProvidersStore];
}

/**
 * Check if a provider is stored
 */
export function hasProvider(name: string): boolean {
    const providers = getStoredProviders();
    return !!providers[name as keyof ProvidersStore];
}

/**
 * Get list of supported provider names
 */
export function getSupportedProviders(): string[] {
    return ['alchemy', 'infura', 'ankr', 'quicknode'];
}

/**
 * Migrate from old storage format to new
 * Call this once on startup to preserve existing keys
 */
export function migrateOldStorage(): void {
    const providers = getStoredProviders();
    let migrated = false;

    // Check old format
    const oldProviderName = localStorage.getItem('pelz_provider_name');
    const oldProviderKey = localStorage.getItem('pelz_provider_key');
    const oldAlchemyKey = localStorage.getItem('pelz_alchemy_key');
    const oldQuicknodeEndpoint = localStorage.getItem('pelz_quicknode_endpoint');

    // Migrate Alchemy
    if (oldAlchemyKey && !providers.alchemy) {
        providers.alchemy = { key: oldAlchemyKey };
        migrated = true;
    }

    // Migrate current provider
    if (oldProviderName && oldProviderKey) {
        if (oldProviderName === 'quicknode' && oldQuicknodeEndpoint) {
            if (!providers.quicknode) {
                providers.quicknode = { endpoint: oldQuicknodeEndpoint, token: oldProviderKey };
                migrated = true;
            }
        } else if (!providers[oldProviderName as keyof ProvidersStore]) {
            providers[oldProviderName as keyof ProvidersStore] = { key: oldProviderKey };
            migrated = true;
        }

        // Set as active if not already set
        if (!getActiveProvider()) {
            setActiveProvider(oldProviderName);
        }
    }

    if (migrated) {
        saveProviders(providers);
    }
}
