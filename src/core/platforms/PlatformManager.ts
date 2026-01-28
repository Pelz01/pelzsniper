// Chain constants for reference (used by individual modules)

/**
 * Platform-specific contract information
 */
export interface PlatformContractInfo {
    // Basic info
    address: string;
    name: string;
    chainId: number;

    // Platform detection
    platform: 'nfts2me' | 'opensea' | 'magiceden' | 'scatter' | 'dutchauction' | 'thirdweb' | 'zora' | 'manifold' | 'generic';
    tokenStandard: 'ERC721' | 'ERC1155';

    // Mint configuration
    mintFunction: string;
    mintPrice: bigint;

    // Platform-specific fees
    protocolFee: bigint;
    creatorFee: bigint;

    // Total value to send = (mintPrice + protocolFee) * quantity + creatorFee
    getTotalValue: (quantity: number) => bigint;

    // Contract state
    isActive: boolean;
    totalSupply?: bigint;
    maxSupply?: bigint;
    maxPerWallet?: bigint;

    // For SeaDrop: the singleton contract to call
    routerContract?: string;
}

/**
 * Interface for platform-specific modules
 */
export interface PlatformModule {
    name: string;

    /**
     * Detect if the contract at the given address belongs to this platform
     * @returns true if this module should handle the contract
     */
    detect(address: string, chainId: number): Promise<boolean>;

    /**
     * Analyze the contract and return platform-specific info
     */
    analyze(address: string, chainId: number): Promise<PlatformContractInfo>;
}

/**
 * Platform Manager - Routes contract analysis to the correct module
 */
export class PlatformManager {
    private modules: PlatformModule[] = [];
    private chainId: number;

    constructor(chainId: number = 1) {
        this.chainId = chainId;
    }

    /**
     * Register a platform module
     */
    registerModule(module: PlatformModule): void {
        this.modules.push(module);
        console.log(`📦 Registered platform module: ${module.name}`);
    }

    /**
     * Set the chain ID and recreate public client
     */
    setChainId(chainId: number): void {
        this.chainId = chainId;
    }

    /**
     * Analyze a contract, optionally forcing a specific platform
     * @param address Contract address
     * @param forcePlatform Force a specific platform module (bypasses detection)
     */
    async analyze(
        address: string,
        forcePlatform?: 'nfts2me' | 'opensea' | 'magiceden' | 'generic'
    ): Promise<PlatformContractInfo> {

        // If platform is forced, find that specific module
        if (forcePlatform && forcePlatform !== 'generic') {
            const forcedModule = this.modules.find(
                m => m.name.toLowerCase() === forcePlatform.toLowerCase()
            );

            if (forcedModule) {
                console.log(`🎯 Using forced platform: ${forcedModule.name}`);
                return await forcedModule.analyze(address, this.chainId);
            } else {
                console.warn(`⚠️ Platform "${forcePlatform}" not found, falling back to detection`);
            }
        }

        // Auto-detect: try each module
        for (const module of this.modules) {
            try {
                const isMatch = await module.detect(address, this.chainId);
                if (isMatch) {
                    console.log(`✅ Detected platform: ${module.name}`);
                    return await module.analyze(address, this.chainId);
                }
            } catch (e) {
                // Module detection failed, continue to next
                console.debug(`Module ${module.name} detection failed:`, e);
            }
        }

        // No platform matched - return generic fallback
        console.log(`ℹ️ No specific platform detected, using generic analyzer`);
        return this.genericAnalyze(address);
    }

    /**
     * Generic fallback analysis (similar to ViemContractAnalyzer)
     */
    private async genericAnalyze(address: string): Promise<PlatformContractInfo> {
        // Import and use the existing ViemContractAnalyzer as fallback
        const { ViemContractAnalyzer } = await import('../ViemContractAnalyzer');
        const analyzer = new ViemContractAnalyzer(this.chainId);
        const info = await analyzer.analyze(address);

        return {
            address: info.address,
            name: info.name || 'Unknown',
            chainId: info.chainId,
            platform: 'generic',
            tokenStandard: 'ERC721', // Default assumption
            mintFunction: info.mintFunction,
            mintPrice: info.mintPrice,
            protocolFee: BigInt(0),
            creatorFee: BigInt(0),
            getTotalValue: (quantity: number) => info.mintPrice * BigInt(quantity),
            isActive: info.isActive,
            totalSupply: BigInt(info.currentSupply || 0),
            maxSupply: BigInt(info.maxSupply || 0),
            maxPerWallet: info.maxPerWallet,
        };
    }

    /**
     * Get list of registered platform names
     */
    getRegisteredPlatforms(): string[] {
        return this.modules.map(m => m.name);
    }
}

// Singleton instance
let platformManagerInstance: PlatformManager | null = null;

export function getPlatformManager(chainId?: number): PlatformManager {
    if (!platformManagerInstance) {
        platformManagerInstance = new PlatformManager(chainId || 1);
    } else if (chainId && chainId !== platformManagerInstance['chainId']) {
        platformManagerInstance.setChainId(chainId);
    }
    return platformManagerInstance;
}
