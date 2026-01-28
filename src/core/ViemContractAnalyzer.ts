import {
    createPublicClient,
    http,
    parseAbi,
    custom
} from 'viem';
import { getChainById } from '../config/chains';

// Parse ABIs for type safety
const nameAbi = parseAbi(['function name() view returns (string)']);
const totalSupplyAbi = parseAbi(['function totalSupply() view returns (uint256)']);
const maxSupplyAbi = parseAbi(['function maxSupply() view returns (uint256)']);
const pausedAbi = parseAbi(['function paused() view returns (bool)']);
const isActiveAbi = parseAbi(['function isActive() view returns (bool)']);
const saleActiveAbi = parseAbi(['function saleActive() view returns (bool)']);
const maxPerWalletAbi = parseAbi(['function maxPerWallet() view returns (uint256)']);
const walletLimitAbi = parseAbi(['function walletLimit() view returns (uint256)']);

// Price ABIs
const costAbi = parseAbi(['function cost() view returns (uint256)']);
const priceAbi = parseAbi(['function price() view returns (uint256)']);
const mintPriceAbi = parseAbi(['function mintPrice() view returns (uint256)']);
const salePriceAbi = parseAbi(['function salePrice() view returns (uint256)']);
const tokenPriceAbi = parseAbi(['function tokenPrice() view returns (uint256)']);
const MINT_PRICE_Abi = parseAbi(['function MINT_PRICE() view returns (uint256)']);
const PRICE_Abi = parseAbi(['function PRICE() view returns (uint256)']);
const valueAbi = parseAbi(['function value() view returns (uint256)']);

// Base ABI for returning with ContractInfo
const BASE_ABI = [
    'function name() view returns (string)',
    'function totalSupply() view returns (uint256)',
    'function maxSupply() view returns (uint256)',
    'function cost() view returns (uint256)',
    'function price() view returns (uint256)',
    'function mintPrice() view returns (uint256)',
    'function paused() view returns (bool)',
    'function isActive() view returns (bool)',
    'function saleActive() view returns (bool)',
    'function maxPerWallet() view returns (uint256)',
    'function walletLimit() view returns (uint256)',
    'function mint(uint256 amount) payable',
    'function publicMint(uint256 amount) payable',
    'function purchase(uint256 amount) payable',
] as const;

export interface ContractInfo {
    address: string;
    abi: readonly string[];
    mintFunction: string;
    mintPrice: bigint;
    maxSupply: number;
    currentSupply: number;
    isActive: boolean;
    requiresAllowlist: boolean;
    name?: string;
    chainId: number;
    maxPerWallet?: bigint;
}

export class ViemContractAnalyzer {
    // Using 'any' to work around viem's strict type inference with dynamic chains
    private publicClient: any;
    private chainId: number;

    constructor(chainId: number = 1, useWindowEthereum: boolean = false) {
        const chain = getChainById(chainId);
        this.chainId = chainId;

        if (useWindowEthereum && window.ethereum) {
            this.publicClient = createPublicClient({
                chain,
                transport: custom(window.ethereum)
            });
        } else {
            this.publicClient = createPublicClient({
                chain,
                transport: http()
            });
        }
    }

    // Allow setting client externally (for burner wallet mode)
    setPublicClient(client: any) {
        this.publicClient = client;
        this.chainId = client.chain?.id || 1;
    }

    async analyze(address: string, mintFuncOverride?: string): Promise<ContractInfo> {
        const contractAddress = address as `0x${string}`;

        // Build mint function signature
        let mintFunction: string;
        let abi: string[] = [...BASE_ABI] as string[];

        if (mintFuncOverride) {
            // Check if we have it in ABI
            const hasFunc = abi.some(item => item.includes(`function ${mintFuncOverride}(`));
            if (!hasFunc) {
                // Add custom function signature
                abi.push(`function ${mintFuncOverride}(uint256 amount) payable`);
            }
            mintFunction = `${mintFuncOverride}(uint256)`;
        } else {
            mintFunction = 'mint(uint256)';
            console.warn("⚠️ No mint function specified. Defaulting to 'mint(uint256)'. If this fails, use 'contract load [addr] --func [name]'");
        }

        // Helper to safely read contract
        const safeRead = async <T>(promise: Promise<T>, fallback: T): Promise<T> => {
            try {
                return await promise;
            } catch {
                return fallback;
            }
        };

        // Race for price - try multiple function names
        const getPrice = async (): Promise<bigint> => {
            const priceCalls = [
                this.publicClient.readContract({ address: contractAddress, abi: costAbi, functionName: 'cost' }),
                this.publicClient.readContract({ address: contractAddress, abi: priceAbi, functionName: 'price' }),
                this.publicClient.readContract({ address: contractAddress, abi: mintPriceAbi, functionName: 'mintPrice' }),
                this.publicClient.readContract({ address: contractAddress, abi: salePriceAbi, functionName: 'salePrice' }),
                this.publicClient.readContract({ address: contractAddress, abi: tokenPriceAbi, functionName: 'tokenPrice' }),
                this.publicClient.readContract({ address: contractAddress, abi: MINT_PRICE_Abi, functionName: 'MINT_PRICE' }),
                this.publicClient.readContract({ address: contractAddress, abi: PRICE_Abi, functionName: 'PRICE' }),
                this.publicClient.readContract({ address: contractAddress, abi: valueAbi, functionName: 'value' }),
            ];

            try {
                const result = await Promise.any(priceCalls);
                return result as bigint;
            } catch {
                return BigInt(0);
            }
        };

        // Parallel fetch all data
        const [
            name,
            totalSupply,
            maxSupply,
            finalPrice,
            paused,
            isActive,
            saleActive,
            maxPerWallet,
            walletLimit
        ] = await Promise.all([
            safeRead(this.publicClient.readContract({ address: contractAddress, abi: nameAbi, functionName: 'name' }), 'Unknown'),
            safeRead(this.publicClient.readContract({ address: contractAddress, abi: totalSupplyAbi, functionName: 'totalSupply' }), BigInt(0)),
            safeRead(this.publicClient.readContract({ address: contractAddress, abi: maxSupplyAbi, functionName: 'maxSupply' }), BigInt(0)),
            getPrice(),
            safeRead(this.publicClient.readContract({ address: contractAddress, abi: pausedAbi, functionName: 'paused' }), false),
            safeRead(this.publicClient.readContract({ address: contractAddress, abi: isActiveAbi, functionName: 'isActive' }), true),
            safeRead(this.publicClient.readContract({ address: contractAddress, abi: saleActiveAbi, functionName: 'saleActive' }), true),
            safeRead(this.publicClient.readContract({ address: contractAddress, abi: maxPerWalletAbi, functionName: 'maxPerWallet' }), BigInt(0)),
            safeRead(this.publicClient.readContract({ address: contractAddress, abi: walletLimitAbi, functionName: 'walletLimit' }), BigInt(0)),
        ]);

        // Combined status
        const isSalesActive = !paused && isActive && saleActive;
        const effectiveMaxWallet = maxPerWallet > 0n ? maxPerWallet : walletLimit;

        return {
            address,
            abi,
            mintFunction,
            mintPrice: finalPrice,
            maxSupply: Number(maxSupply),
            currentSupply: Number(totalSupply),
            isActive: isSalesActive,
            requiresAllowlist: false,
            name: name,
            chainId: this.chainId,
            maxPerWallet: effectiveMaxWallet
        };
    }
}

