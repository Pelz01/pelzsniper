import { BrowserProvider, JsonRpcProvider, Wallet, type Signer, formatUnits } from 'ethers';
import { NETWORKS } from '../config/networks';

export interface WalletInfo {
    address: string;
    chainId: number;
    balance: string;
    isBurner: boolean;
}

export class BlockchainManager {
    private provider: BrowserProvider | JsonRpcProvider | null = null;
    private signer: Signer | null = null;
    private privateKey: string | null = null;
    private currentChainId: number = 1; // Default Mainnet

    async connect(): Promise<WalletInfo> {
        if (this.privateKey) {
            // --- Burner Wallet Mode ---
            // Use local RPC provider based on current Chain ID preference
            const network = Object.values(NETWORKS).find(n => n.id === this.currentChainId) || NETWORKS.mainnet;
            this.currentChainId = network.id;

            this.provider = new JsonRpcProvider(network.rpc);
            this.signer = new Wallet(this.privateKey, this.provider);

            const address = await this.signer.getAddress();
            const balance = await this.provider.getBalance(address);

            this.walletInfo = {
                address,
                chainId: network.id,
                balance: formatUnits(balance, 18),
                isBurner: true
            };
        } else {
            // --- Browser Wallet Mode ---
            // --- Browser Wallet Mode ---

            // Polling for injection (Fix for "New Browser" issue)
            if (!window.ethereum) {
                console.log("⏳ Waiting for wallet injection...");
                // Try waiting up to 1s for injection
                for (let i = 0; i < 10; i++) {
                    await new Promise(r => setTimeout(r, 100));
                    if (window.ethereum) {
                        console.log("✅ Wallet injected!");
                        break;
                    }
                }
            }

            console.log("🔍 Debug: window.ethereum is", typeof window.ethereum);

            if (!window.ethereum) {
                throw new Error("No Wallet Found! (window.ethereum is undefined). Try refreshing.");
            }

            this.provider = new BrowserProvider(window.ethereum);

            // Explicitly request accounts to force prompt
            try {
                await this.provider.send("eth_requestAccounts", []);
            } catch (e: any) {
                if (e.code === 4001) throw new Error("Connection Rejected by User");
                throw e;
            }
            this.signer = await this.provider.getSigner();

            // Parallelize network calls for speed (User Request: "load faster")
            const [address, network, balance] = await Promise.all([
                this.signer.getAddress(),
                this.provider.getNetwork(),
                this.provider.getBalance(await this.signer.getAddress()) // Potentially redundant address fetch, but safer if signer needs it internaly
            ]);

            this.currentChainId = Number(network.chainId);

            this.walletInfo = {
                address,
                chainId: Number(network.chainId),
                balance: formatUnits(balance, 18),
                isBurner: false
            };
        }

        return this.walletInfo;
    }

    async getGasPrice() {
        if (!this.provider) throw new Error("Not connected");
        const feeData = await this.provider.getFeeData();
        return {
            baseFee: feeData.gasPrice,
            maxFeePerGas: feeData.maxFeePerGas,
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
        };
    }

    isConnected(): boolean {
        return !!this.signer;
    }

    getWalletInfo(): WalletInfo | null {
        // access cached info or re-fetch? 
        // For now we need to store it.
        // We'll trust the caller handles caching or we add state here.
        // Let's add state.
        return this.walletInfo;
    }

    private walletInfo: WalletInfo | null = null;

    constructor() {
        // Prevent MetaMask auto-reload by registering listeners
        if (window.ethereum) {
            window.ethereum.on('chainChanged', (chainId: string) => {
                console.log("Chain changed to:", chainId);
                // We handle this internally, no need to reload
                if (!this.privateKey) {
                    this.currentChainId = parseInt(chainId, 16);
                    this.connect().catch(console.error);
                }
            });
            window.ethereum.on('accountsChanged', (accounts: string[]) => {
                console.log("Accounts changed:", accounts);
                if (!this.privateKey) {
                    this.connect().catch(console.error);
                }
            });
        }

        // Auto-restore Burner Wallet from Session
        const savedKey = sessionStorage.getItem('pelz_burner_key');
        if (savedKey) {
            this.privateKey = savedKey;
            // Don't auto-connect in constructor to avoid async issues, 
            // controller will call connect() or we can expose a restore method.
        }
    }

    async importWallet(privateKey: string) {
        // Validate key format roughly
        if (!privateKey.match(/^0x[a-fA-F0-9]{64}$/)) {
            throw new Error("Invalid Private Key format (must start with 0x and be 64 hex chars)");
        }
        this.privateKey = privateKey;
        sessionStorage.setItem('pelz_burner_key', privateKey); // Persist
        await this.connect();
    }

    clearWallet() {
        this.privateKey = null;
        this.provider = null;
        this.signer = null;
        this.walletInfo = null;
        sessionStorage.removeItem('pelz_burner_key');
    }
    async switchNetwork(chainId: number) {
        if (this.privateKey) {
            // --- Burner Mode Switch ---
            // Just update local provider and re-connect
            const network = Object.values(NETWORKS).find(n => n.id === chainId);
            if (!network) throw new Error(`Network ${chainId} not configured`);

            this.currentChainId = chainId;
            await this.connect(); // Re-init provider with new RPC
        } else {
            // --- Browser Mode Switch ---
            if (!this.provider) throw new Error("Not connected");

            // Find network config
            const network = Object.values(NETWORKS).find(n => n.id === chainId);
            if (!network) throw new Error(`Network ${chainId} not configured`);

            try {
                // @ts-ignore
                await this.provider.send("wallet_switchEthereumChain", [{ chainId: network.hex }]);
            } catch (error: any) {
                // This error code indicates that the chain has not been added to MetaMask.
                if (error.code === 4902) {
                    // @ts-ignore
                    await this.provider.send("wallet_addEthereumChain", [{
                        chainId: network.hex,
                        chainName: network.name,
                        rpcUrls: [network.rpc],
                        nativeCurrency: network.nativeCurrency,
                        blockExplorerUrls: [network.explorer]
                    }]);
                } else {
                    throw error;
                }
            }

            // Refresh connection info after switch
            await this.connect();
        }
    }
}
