/**
 * Centralized RPC Transport Configuration
 * Handles multi-provider support (Alchemy, Infura, Ankr)
 */
import { http, webSocket, fallback, type Transport } from 'viem';

/**
 * Get Transport based on Configured Provider
 * Checks localStorage for provider name and API key
 */
export const getProviderTransport = (chainId: number): Transport => {
    // Check for specific provider override
    const providerName = localStorage.getItem('pelz_provider_name');
    const apiKey = localStorage.getItem('pelz_provider_key') || localStorage.getItem('pelz_alchemy_key');

    if (!apiKey) return http();

    // -- ALCHEMY --
    if (providerName === 'alchemy' || (!providerName && apiKey)) {
        const networks: Record<number, string> = {
            1: 'eth-mainnet',
            11155111: 'eth-sepolia',
            137: 'polygon-mainnet',
            42161: 'arb-mainnet',
            10: 'opt-mainnet',
            8453: 'base-mainnet',
        };
        const prefix = networks[chainId];
        if (prefix) {
            return fallback([
                webSocket(`wss://${prefix}.g.alchemy.com/v2/${apiKey}`),
                http(`https://${prefix}.g.alchemy.com/v2/${apiKey}`)
            ]);
        }
    }

    // -- INFURA --
    if (providerName === 'infura') {
        const networks: Record<number, string> = {
            1: 'mainnet',
            11155111: 'sepolia',
            137: 'polygon-mainnet',
            42161: 'arbitrum-mainnet',
            10: 'optimism-mainnet',
            8453: 'base-mainnet',
        };
        const prefix = networks[chainId];
        if (prefix) {
            return fallback([
                http(`https://${prefix}.infura.io/v3/${apiKey}`)
            ]);
        }
    }

    // -- ANKR --
    if (providerName === 'ankr') {
        const networks: Record<number, string> = {
            1: 'eth',
            11155111: 'eth_sepolia',
            137: 'polygon',
            42161: 'arbitrum',
            10: 'optimism',
            8453: 'base',
        };
        const prefix = networks[chainId];
        if (prefix) {
            return http(`https://rpc.ankr.com/${prefix}/${apiKey}`);
        }
    }

    // Default fallback to public HTTP
    return http();
};
