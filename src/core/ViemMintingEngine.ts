import {
    createPublicClient,
    createWalletClient,
    encodeFunctionData,
    parseAbi,
    type Hash,
    custom
} from 'viem';
import type { ContractInfo } from './ViemContractAnalyzer';
import { getChainById } from '../config/chains';
import { getProviderTransport } from '../config/transport';

export interface MintTransaction {
    to: `0x${string}`;
    data: `0x${string}`;
    value: bigint;
    gas: bigint;
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
}

export interface GasSettings {
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
}

export class ViemMintingEngine {
    // Using 'any' to work around viem's strict type inference with dynamic chains
    private publicClient: any;
    private walletClient: any = null;
    private preparedTx: MintTransaction | null = null;
    private account: `0x${string}` | null = null;

    constructor(chainId: number = 1) {
        const chain = getChainById(chainId);
        const transport = getProviderTransport(chainId);

        this.publicClient = createPublicClient({
            chain,
            transport
        });
    }

    // Initialize for browser wallet mode
    async initBrowserWallet(chainId: number): Promise<void> {
        if (!window.ethereum) {
            throw new Error("No wallet found");
        }

        const chain = getChainById(chainId);

        // Get accounts
        const accounts = await window.ethereum.request({
            method: 'eth_requestAccounts'
        }) as string[];

        if (!accounts || accounts.length === 0) {
            throw new Error("No accounts available");
        }

        this.account = accounts[0] as `0x${string}`;

        this.walletClient = createWalletClient({
            account: this.account,
            chain,
            transport: custom(window.ethereum)
        });

        this.publicClient = createPublicClient({
            chain,
            transport: custom(window.ethereum)
        });
    }

    // Initialize for burner wallet mode (receives pre-made clients)
    initBurnerWallet(walletClient: any, publicClient: any): void {
        this.walletClient = walletClient;
        this.publicClient = publicClient;
        this.account = walletClient.account?.address || null;
    }

    async getGasPrice(turbo: boolean = false): Promise<GasSettings> {
        const feeData = await this.publicClient.estimateFeesPerGas();

        // Turbo mode: 10x priority fee for instant inclusion
        const priorityMultiplier = turbo ? BigInt(10) : BigInt(1);
        const basePriority = feeData.maxPriorityFeePerGas || BigInt(1_500_000_000);

        return {
            maxFeePerGas: feeData.maxFeePerGas || BigInt(50_000_000_000),
            maxPriorityFeePerGas: basePriority * priorityMultiplier
        };
    }

    async prepareTransaction(
        contract: ContractInfo,
        quantity: number,
        gasSettings: GasSettings,
        priceOverride?: bigint,
        skipSimulation: boolean = false
    ): Promise<MintTransaction> {
        if (!this.account) {
            throw new Error("No wallet connected. Call initBrowserWallet or initBurnerWallet first.");
        }

        console.log(`Preparing Tx: Func=${contract.mintFunction}, Qty=${quantity}`);

        // Build the function signature and encode data
        // Use a common mint ABI pattern since the function takes uint256
        const mintAbi = parseAbi([
            'function mint(uint256 amount) payable',
            'function publicMint(uint256 amount) payable',
            'function purchase(uint256 amount) payable'
        ] as const);

        const functionName = contract.mintFunction.split('(')[0] as 'mint' | 'publicMint' | 'purchase';

        let data: `0x${string}`;
        try {
            data = encodeFunctionData({
                abi: mintAbi,
                functionName: functionName,
                args: [BigInt(quantity)]
            });
        } catch {
            // Fallback: manually encode for mint(uint256) type functions
            // mint(uint256) selector is 0xa0712d68
            const quantityHex = BigInt(quantity).toString(16).padStart(64, '0');
            data = `0xa0712d68${quantityHex}` as `0x${string}`;
        }

        console.log(`Generated Calldata: ${data}`);

        // Calculate value
        const pricePerToken = priceOverride !== undefined ? priceOverride : contract.mintPrice;
        const value = pricePerToken * BigInt(quantity);

        const txRequest = {
            account: this.account,
            to: contract.address as `0x${string}`,
            data,
            value,
        };

        // --- SIMULATION (Skip in turbo mode) ---
        if (!skipSimulation) {
            console.log("🔍 Simulating transaction...");
            console.log("📋 TX Request:", JSON.stringify({
                to: txRequest.to,
                data: txRequest.data?.substring(0, 20) + '...',
                value: txRequest.value?.toString()
            }));

            try {
                await this.publicClient.call(txRequest);
                console.log("✅ Simulation Successful");
            } catch (e: any) {
                console.error("❌ Simulation Failed:", e);
                console.error("Full error object:", JSON.stringify(e, null, 2));

                // Common NFT custom error selectors
                const ERROR_SELECTORS: Record<string, string> = {
                    '0xc288bf8f': 'MintNotActive() - The mint is not currently active',
                    '0x3c55b53b': 'SaleNotStarted() - Sale has not started yet',
                    '0x6f7eac26': 'MaxSupplyReached() - No more tokens available',
                    '0x8e4a23d6': 'ExceedsWalletLimit() - You have reached the max per wallet',
                    '0xb1baf4f3': 'InsufficientPayment() - Not enough ETH sent',
                    '0x21d5efb2': 'InvalidMintAmount() - Invalid quantity',
                    '0x2c5211c6': 'InvalidProof() - Allowlist proof invalid',
                    '0xcd786059': 'InvalidPrice() - Incorrect price sent',
                    '0x646cf558': 'Paused() - Contract is paused',
                    '0xa1d1e8d6': 'NotWhitelisted() - Not on allowlist',
                };

                let reason = "Execution reverted";
                let errorSelector = '';

                // Try to extract error selector from RPC response
                try {
                    const rpcError = e.cause?.cause;
                    if (rpcError?.data && typeof rpcError.data === 'string') {
                        errorSelector = rpcError.data.slice(0, 10);
                        console.log("🔍 Error Selector:", errorSelector);

                        if (ERROR_SELECTORS[errorSelector]) {
                            reason = ERROR_SELECTORS[errorSelector];
                        } else {
                            reason = `Custom Error: ${errorSelector} (Check contract source for meaning)`;
                        }
                    }
                } catch {
                    // Selector extraction failed
                }

                // Fallback to other error sources
                if (reason === "Execution reverted") {
                    if (e.cause?.reason) {
                        reason = e.cause.reason;
                    } else if (e.cause?.shortMessage) {
                        reason = e.cause.shortMessage;
                    } else if (e.shortMessage) {
                        reason = e.shortMessage;
                    } else if (e.details) {
                        reason = e.details;
                    }
                }

                // Add helpful context
                const hints: string[] = [];
                if (contract.mintPrice === BigInt(0)) {
                    hints.push("Price is 0 ETH - verify this is correct or use --price");
                }
                if (!contract.isActive) {
                    hints.push("Contract shows mint may not be active");
                }

                const contextHint = hints.length > 0 ? ` (${hints.join('; ')})` : "";

                throw new Error(`Simulation Failed: ${reason}${contextHint}`);
            }
        } else {
            console.log("⚡ TURBO MODE: Skipping simulation for speed");
        }

        // --- GAS ESTIMATION (Use fixed high limit in turbo mode) ---
        let gasLimit: bigint;
        if (skipSimulation) {
            gasLimit = BigInt(500000); // Fixed high limit for speed
        } else {
            try {
                const est = await this.publicClient.estimateGas(txRequest);
                gasLimit = (est * BigInt(120)) / BigInt(100); // 20% buffer
            } catch (e) {
                console.warn("Gas estimation failed, using default high limit");
                gasLimit = BigInt(300000);
            }
        }

        this.preparedTx = {
            to: contract.address as `0x${string}`,
            data,
            value,
            gas: gasLimit,
            maxFeePerGas: gasSettings.maxFeePerGas,
            maxPriorityFeePerGas: gasSettings.maxPriorityFeePerGas
        };

        return this.preparedTx;
    }

    async execute(): Promise<Hash> {
        if (!this.preparedTx) throw new Error("No transaction prepared");
        if (!this.walletClient) throw new Error("No wallet connected");
        if (!this.account) throw new Error("No account set");

        console.log("Executing tx:", this.preparedTx);

        try {
            const hash = await this.walletClient.sendTransaction({
                account: this.account,
                to: this.preparedTx.to,
                data: this.preparedTx.data,
                value: this.preparedTx.value,
                gas: this.preparedTx.gas,
                maxFeePerGas: this.preparedTx.maxFeePerGas,
                maxPriorityFeePerGas: this.preparedTx.maxPriorityFeePerGas,
                chain: this.publicClient.chain
            });

            return hash;
        } catch (e: any) {
            console.error("Mint execution failed:", e);

            // Clean up error message
            if (e.shortMessage) throw new Error(e.shortMessage);
            if (e.cause?.reason) throw new Error(`Revert: ${e.cause.reason}`);
            if (e.message?.includes('insufficient funds')) throw new Error("Insufficient Funds for Gas/Price");
            throw e;
        }
    }

    async waitForReceipt(hash: Hash) {
        return await this.publicClient.waitForTransactionReceipt({ hash });
    }

    async startMinting(contract: ContractInfo): Promise<Hash> {
        const gasSettings = await this.getGasPrice();
        await this.prepareTransaction(contract, 1, gasSettings);
        return await this.execute();
    }

    getPreparedTx(): MintTransaction | null {
        return this.preparedTx;
    }
}
