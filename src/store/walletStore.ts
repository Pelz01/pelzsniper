import { create } from 'zustand';
import {
    createWalletClient,
    formatEther,
    createPublicClient
} from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { getChainById } from '../config/chains';
import { getProviderTransport } from '../config/transport';

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
