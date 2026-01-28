/**
 * Headless Wallet - For CLI/Node.js usage without browser
 * Provides same interface as walletStore but for Node.js environment
 */
import {
    createWalletClient,
    createPublicClient,
    http,
    formatEther,
    webSocket,
    fallback,
    type Transport
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getChainById, CHAINS } from '../config/chains';

interface HeadlessConfig {
    provider?: 'alchemy' | 'infura' | 'ankr';
    apiKey?: string;
    privateKey?: string;
    defaultChain?: number;
}

/**
 * Get Transport for Node.js environment
 */
function getNodeTransport(chainId: number, config: HeadlessConfig): Transport {
    const { provider, apiKey } = config;
    if (!apiKey) return http();

    // -- ALCHEMY --
    if (provider === 'alchemy') {
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
    if (provider === 'infura') {
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
            return http(`https://${prefix}.infura.io/v3/${apiKey}`);
        }
    }

    // -- ANKR --
    if (provider === 'ankr') {
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

    return http();
}

export class HeadlessWallet {
    private config: HeadlessConfig;
    private chainId: number;
    public walletClient: ReturnType<typeof createWalletClient> | null = null;
    public publicClient: ReturnType<typeof createPublicClient> | null = null;
    public address: string | null = null;

    constructor(config: HeadlessConfig) {
        this.config = config;
        this.chainId = config.defaultChain || 1;
    }

    /**
     * Initialize wallet from private key
     */
    async init(): Promise<string> {
        if (!this.config.privateKey) {
            throw new Error('No private key in config');
        }

        const chain = getChainById(this.chainId);
        const transport = getNodeTransport(this.chainId, this.config);
        const account = privateKeyToAccount(this.config.privateKey as `0x${string}`);

        this.publicClient = createPublicClient({ chain, transport });
        this.walletClient = createWalletClient({ account, chain, transport });
        this.address = account.address;

        return this.address;
    }

    /**
     * Switch to a different chain
     */
    async switchChain(chainId: number): Promise<void> {
        this.chainId = chainId;
        await this.init();
    }

    /**
     * Get current balance
     */
    async getBalance(): Promise<string> {
        if (!this.publicClient || !this.address) {
            throw new Error('Wallet not initialized');
        }
        const balance = await this.publicClient.getBalance({
            address: this.address as `0x${string}`
        });
        return formatEther(balance);
    }

    /**
     * Get supported chains
     */
    getSupportedChains(): { id: number; name: string }[] {
        return Object.entries(CHAINS).map(([_, chain]) => ({
            id: chain.id,
            name: chain.name
        }));
    }
}
