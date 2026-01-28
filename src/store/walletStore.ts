import { create } from 'zustand';
import {
    createWalletClient,
    http,
    formatEther,
    createPublicClient,
    type Chain,
    defineChain,
    webSocket,
    type Transport,
    fallback
} from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { mainnet, sepolia, goerli, polygon, arbitrum, optimism, base } from 'viem/chains';

const abstract = defineChain({
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

const hyperliquid = defineChain({
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

const megaeth = defineChain({
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

// Chain lookup map
const CHAINS: Record<number, Chain> = {
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
};

const getChainById = (id: number): Chain => CHAINS[id] || mainnet;

// Helper to get Transport based on Configured Provider
const getProviderTransport = (chainId: number): Transport => {
    // 1. Check for specific provider override
    const providerName = localStorage.getItem('pelz_provider_name');
    const apiKey = localStorage.getItem('pelz_provider_key') || localStorage.getItem('pelz_alchemy_key'); // Fallback for backward compat

    if (!apiKey) return http();

    // -- ALCHEMY --
    if (providerName === 'alchemy' || (!providerName && apiKey)) { // Default to Alchemy if generic key present
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
            // Prefer WSS for speed
            return fallback([
                webSocket(`wss://${prefix}.g.alchemy.com/v2/${apiKey}`),
                http(`https://${prefix}.g.alchemy.com/v2/${apiKey}`)
            ]);
        }
    }

    // -- INFURA --
    if (providerName === 'infura') {
        // Infura uses same key for all networks, but different subdomains usually just prefix
        // v3 is standard for all now.
        // NOTE: Infura WSS support varies by plan, sticking to HTTP fallback if WSS fails commonly
        // URL format: https://<network>.infura.io/v3/<key>

        const networks: Record<number, string> = {
            1: 'mainnet',
            11155111: 'sepolia',
            137: 'polygon-mainnet',
            42161: 'arbitrum-mainnet',
            10: 'optimism-mainnet',
            8453: 'base-mainnet', // Note: Check infura specific slugs if needed
        };
        const prefix = networks[chainId];
        if (prefix) {
            return fallback([
                // webSocket(`wss://${prefix}.infura.io/ws/v3/${apiKey}`), // WSS often requires specific plan
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

export interface WalletInfo {
    address: string;
    chainId: number;
    balance: string;
    isBurner: boolean;
}

export interface WalletState {
    // State
    walletInfo: WalletInfo | null;
    isConnecting: boolean;
    error: string | null;
    isBurnerMode: boolean;

    // Clients (for burner mode)
    burnerWalletClient: ReturnType<typeof createWalletClient> | null;
    burnerPublicClient: ReturnType<typeof createPublicClient> | null;
    privateKey: string | null;

    // Actions
    connectBrowserWallet: () => Promise<WalletInfo>;
    importBurnerWallet: (privateKey: string, chainId?: number) => Promise<WalletInfo>;
    generateBurnerWallet: (chainId?: number) => Promise<{ address: string; privateKey: string; info: WalletInfo }>;
    disconnect: () => void;
    switchNetwork: (chainId: number) => Promise<void>;
    getBalance: () => Promise<string>;

    // Getters
    isConnected: () => boolean;
    getWalletClient: () => ReturnType<typeof createWalletClient> | null;
    getPublicClient: () => ReturnType<typeof createPublicClient> | null;
}

export const useWalletStore = create<WalletState>((set, get) => ({
    // Initial state
    walletInfo: null,
    isConnecting: false,
    error: null,
    isBurnerMode: false,
    burnerWalletClient: null,
    burnerPublicClient: null,
    privateKey: null,

    // Connect browser wallet via window.ethereum (wagmi handles this via hooks, but we expose imperative API)
    connectBrowserWallet: async (): Promise<WalletInfo> => {
        set({ isConnecting: true, error: null });

        try {
            // Wait for ethereum injection
            if (!window.ethereum) {
                console.log("⏳ Waiting for wallet injection...");
                for (let i = 0; i < 10; i++) {
                    await new Promise(r => setTimeout(r, 100));
                    if (window.ethereum) break;
                }
            }

            if (!window.ethereum) {
                throw new Error("No Wallet Found! Install MetaMask or Rabby and refresh.");
            }

            // Request accounts
            const accounts = await window.ethereum.request({
                method: 'eth_requestAccounts'
            }) as string[];

            if (!accounts || accounts.length === 0) {
                throw new Error("No accounts returned from wallet");
            }

            const address = accounts[0];

            // Get chain ID
            const chainIdHex = await window.ethereum.request({
                method: 'eth_chainId'
            }) as string;
            const chainId = parseInt(chainIdHex, 16);

            // Get balance
            const balanceHex = await window.ethereum.request({
                method: 'eth_getBalance',
                params: [address, 'latest']
            }) as string;
            const balance = formatEther(BigInt(balanceHex));

            const info: WalletInfo = {
                address,
                chainId,
                balance,
                isBurner: false
            };

            set({
                walletInfo: info,
                isConnecting: false,
                isBurnerMode: false,
                burnerWalletClient: null,
                burnerPublicClient: null,
                privateKey: null
            });

            return info;

        } catch (e: any) {
            const errorMsg = e.code === 4001
                ? "Connection rejected by user"
                : e.message || "Failed to connect wallet";
            set({ isConnecting: false, error: errorMsg });
            throw new Error(errorMsg);
        }
    },

    // Import burner wallet via private key
    importBurnerWallet: async (privateKey: string, chainId: number = 1): Promise<WalletInfo> => {
        set({ isConnecting: true, error: null });

        try {
            // Validate key format
            if (!privateKey.match(/^0x[a-fA-F0-9]{64}$/)) {
                throw new Error("Invalid Private Key format (must be 0x + 64 hex chars)");
            }

            const chain = getChainById(chainId);
            const account = privateKeyToAccount(privateKey as `0x${string}`);

            // Create viem clients
            const transport = getProviderTransport(chain.id);

            const publicClient = createPublicClient({
                chain,
                transport
            });

            const walletClient = createWalletClient({
                account,
                chain,
                transport
            });

            // Get balance
            const balanceBigInt = await publicClient.getBalance({ address: account.address });
            const balance = formatEther(balanceBigInt);

            const info: WalletInfo = {
                address: account.address,
                chainId: chain.id,
                balance,
                isBurner: true
            };

            // Store in session for persistence
            sessionStorage.setItem('pelz_burner_key', privateKey);

            set({
                walletInfo: info,
                isConnecting: false,
                isBurnerMode: true,
                burnerWalletClient: walletClient,
                burnerPublicClient: publicClient,
                privateKey
            });

            return info;

        } catch (e: any) {
            set({ isConnecting: false, error: e.message });
            throw e;
        }
    },

    // Generate new burner wallet
    generateBurnerWallet: async (chainId: number = 1) => {
        const privateKey = generatePrivateKey();
        const state = get();

        // Import the generated key
        const info = await state.importBurnerWallet(privateKey, chainId);

        return {
            address: info.address,
            privateKey,
            info
        };
    },

    // Disconnect wallet
    disconnect: () => {
        sessionStorage.removeItem('pelz_burner_key');
        set({
            walletInfo: null,
            isBurnerMode: false,
            burnerWalletClient: null,
            burnerPublicClient: null,
            privateKey: null,
            error: null
        });
    },

    // Switch network
    switchNetwork: async (chainId: number) => {
        const state = get();

        if (state.isBurnerMode && state.privateKey) {
            // Burner mode: re-create clients on new chain
            await state.importBurnerWallet(state.privateKey, chainId);
        } else {
            // Browser mode: request chain switch
            if (!window.ethereum) throw new Error("No wallet connected");

            const chain = getChainById(chainId);
            const chainIdHex = `0x${chainId.toString(16)}`;

            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: chainIdHex }]
                });
            } catch (e: any) {
                // Chain not added, try to add it
                if (e.code === 4902) {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [{
                            chainId: chainIdHex,
                            chainName: chain.name,
                            rpcUrls: [chain.rpcUrls.default.http[0]],
                            nativeCurrency: chain.nativeCurrency,
                            blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : undefined
                        }]
                    });
                } else {
                    throw e;
                }
            }

            // Refresh wallet info
            await state.connectBrowserWallet();
        }
    },

    // Get current balance
    getBalance: async (): Promise<string> => {
        const state = get();
        if (!state.walletInfo) throw new Error("Not connected");

        if (state.isBurnerMode && state.burnerPublicClient) {
            const balance = await state.burnerPublicClient.getBalance({
                address: state.walletInfo.address as `0x${string}`
            });
            return formatEther(balance);
        } else if (window.ethereum) {
            const balanceHex = await window.ethereum.request({
                method: 'eth_getBalance',
                params: [state.walletInfo.address, 'latest']
            }) as string;
            return formatEther(BigInt(balanceHex));
        }

        throw new Error("No provider available");
    },

    // Check if connected
    isConnected: () => !!get().walletInfo,

    // Get wallet client (for burner mode transactions)
    getWalletClient: () => get().burnerWalletClient,

    // Get public client (for burner mode reads)
    getPublicClient: () => get().burnerPublicClient,
}));

// Auto-restore burner wallet on load
const savedKey = sessionStorage.getItem('pelz_burner_key');
if (savedKey) {
    useWalletStore.getState().importBurnerWallet(savedKey).catch(console.error);
}
