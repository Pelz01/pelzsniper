/**
 * Centralized RPC Transport Configuration
 * Handles multi-provider support (Alchemy, Infura, Ankr, QuickNode)
 */
import { http, webSocket, fallback, type Transport } from 'viem';
import { getActiveProvider, getProviderConfig, migrateOldStorage } from './providerStorage';

// Chain network mappings for each provider
export const CHAIN_MAPPINGS = {
    alchemy: {
        1: 'eth-mainnet',
        11155111: 'eth-sepolia',
        137: 'polygon-mainnet',
        42161: 'arb-mainnet',
        10: 'opt-mainnet',
        8453: 'base-mainnet',
        57073: 'ink-mainnet',
        2741: 'abstract-mainnet',
        4326: 'megaeth-mainnet', // Guessing subdomain
        999: 'hyperliquid-mainnet',
    } as Record<number, string>,

    infura: {
        1: 'mainnet',
        11155111: 'sepolia',
        137: 'polygon-mainnet',
        42161: 'arbitrum-mainnet',
        10: 'optimism-mainnet',
        8453: 'base-mainnet',
        // Infura does not widely support Ink/Abstract yet
    } as Record<number, string>,

    ankr: {
        1: 'eth',
        11155111: 'eth_sepolia',
        137: 'polygon',
        42161: 'arbitrum',
        10: 'optimism',
        8453: 'base',
        // Ankr returns 403 for these on standard plans
        // 57073: 'ink',
        // 2741: 'abstract',
        // 999: 'hyperliquid',
        // 4326: 'megaeth',
    } as Record<number, string>,

    quicknode: {
        1: '',              // Mainnet: endpoint.quiknode.pro
        8453: 'base-mainnet',
        42161: 'arbitrum-mainnet',
        137: 'matic',       // User confirmed 'matic'
        10: 'optimism-mainnet',
        11155111: 'eth-sepolia',
        57073: 'ink-mainnet',
        2741: 'abstract-mainnet',
        999: 'hype-mainnet', // User confirmed 'hype-mainnet'
        4326: 'megaeth-mainnet',
    } as Record<number, string>,
};

/**
 * Build RPC URL for a provider and chain
 * Returns both HTTP and WSS URLs
 */
export function buildProviderUrls(provider: string, chainId: number): { http?: string; wss?: string } {
    const config = getProviderConfig(provider);
    if (!config) return {};

    switch (provider) {
        case 'alchemy': {
            const prefix = CHAIN_MAPPINGS.alchemy[chainId];
            if (!prefix || !config.key) return {};
            return {
                http: `https://${prefix}.g.alchemy.com/v2/${config.key}`,
                wss: `wss://${prefix}.g.alchemy.com/v2/${config.key}`,
            };
        }

        case 'infura': {
            const prefix = CHAIN_MAPPINGS.infura[chainId];
            if (!prefix || !config.key) return {};
            return {
                http: `https://${prefix}.infura.io/v3/${config.key}`,
                wss: `wss://${prefix}.infura.io/ws/v3/${config.key}`,
            };
        }

        case 'ankr': {
            const prefix = CHAIN_MAPPINGS.ankr[chainId];
            if (!prefix || !config.key) return {};
            return {
                http: `https://rpc.ankr.com/${prefix}/${config.key}`,
                wss: `wss://rpc.ankr.com/${prefix}/${config.key}`,
            };
        }

        case 'quicknode': {
            const chainPrefix = CHAIN_MAPPINGS.quicknode[chainId];
            if (chainPrefix === undefined || !config.endpoint || !config.token) return {};
            const domain = chainPrefix ? `${config.endpoint}.${chainPrefix}.quiknode.pro` : `${config.endpoint}.quiknode.pro`;

            // Special case for Hyperliquid EVM suffix
            const suffix = chainId === 999 ? '/evm' : '';

            return {
                http: `https://${domain}/${config.token}${suffix}`,
                wss: `wss://${domain}/${config.token}${suffix}`,
            };
        }

        default:
            return {};
    }
}

/**
 * Get Transport based on Configured Provider
 * Uses new multi-provider storage format
 */
export const getProviderTransport = (chainId: number): Transport => {
    // Migrate old storage format on first access
    migrateOldStorage();

    // Check for custom RPC override first
    const customRpc = localStorage.getItem(`pelz_custom_rpc_${chainId}`);
    if (customRpc) {
        if (customRpc.startsWith('wss://')) {
            return fallback([
                webSocket(customRpc),
                http(customRpc.replace('wss://', 'https://'))
            ]);
        }
        return http(customRpc);
    }

    // Get active provider
    const activeProvider = getActiveProvider();
    if (!activeProvider) return http();

    // Build URLs for active provider
    const urls = buildProviderUrls(activeProvider, chainId);
    if (!urls.http) return http();

    // Return transport with WSS primary, HTTP fallback
    if (urls.wss) {
        return fallback([
            webSocket(urls.wss),
            http(urls.http)
        ]);
    }

    return http(urls.http);
};
