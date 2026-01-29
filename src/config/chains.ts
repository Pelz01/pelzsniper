/**
 * Centralized Chain Configuration
 * All chain definitions should be imported from here.
 */
import { type Chain, defineChain } from 'viem';
import { mainnet, sepolia, goerli, polygon, arbitrum, optimism, base } from 'viem/chains';

// Custom chain definitions
export const abstract = defineChain({
    id: 2741,
    name: 'Abstract',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
        default: { http: ['https://api.mainnet.abs.xyz'] },
    },
    blockExplorers: {
        default: { name: 'Abscan', url: 'https://abscan.org' },
    },
});

export const hyperliquid = defineChain({
    id: 999,
    name: 'Hyperliquid EVM',
    nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
    rpcUrls: {
        default: { http: ['https://rpc.hyperliquid.xyz/evm'] },
    },
    blockExplorers: {
        default: { name: 'HypurrScan', url: 'https://hyperevmscan.io' },
    },
});

export const megaeth = defineChain({
    id: 4326,
    name: 'MegaETH Mainnet',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
        default: { http: ['https://mainnet.megaeth.com/rpc'] },
    },
    blockExplorers: {
        default: { name: 'Etherscan', url: 'https://mega.etherscan.com' },
    },
});

export const ink = defineChain({
    id: 57073,
    name: 'Ink',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
        default: { http: ['https://rpc-gel.inkonchain.com'] },
    },
    blockExplorers: {
        default: { name: 'Ink Explorer', url: 'https://explorer.inkonchain.com' },
    },
});

// Master chain lookup map
export const CHAINS: Record<number, Chain> = {
    1: mainnet,
    11155111: sepolia,
    5: goerli,
    137: polygon,
    42161: arbitrum,
    10: optimism,
    8453: base,
    2741: abstract,
    999: hyperliquid,
    4326: megaeth,
    57073: ink,
};

/**
 * Get a chain by its ID, defaults to mainnet if not found
 */
export const getChainById = (id: number): Chain => CHAINS[id] || mainnet;
