import { ethers, Contract } from 'ethers';
import { UNIVERSAL_ABI } from '../config/abis';

export interface ContractInfo {
    address: string;
    abi: any[];
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

export class ContractAnalyzer {
    private provider: ethers.Provider;

    constructor(provider: ethers.Provider) {
        this.provider = provider;
    }

    async analyze(address: string, mintFuncOverride?: string): Promise<ContractInfo> {
        // ... (ABI setup remains similar, condensed for brevity in edit)
        let abi = [...UNIVERSAL_ABI];
        let mintFunction = mintFuncOverride;
        const findLike = (name: string) => abi.find(item => typeof item === 'string' && item.startsWith(`function ${name}(`));

        if (mintFunction) {
            const exists = abi.some(item => typeof item === 'string' && item.includes(`function ${mintFunction}(`));
            if (!exists) {
                const sig = `function ${mintFunction}(uint256 amount) payable`;
                abi.push(sig);
                mintFunction = `${mintFunction}(uint256)`;
            } else {
                const specific = abi.find(s => typeof s === 'string' && s.includes(`function ${mintFunction}(uint256 amount)`));
                mintFunction = specific ? `${mintFunction}(uint256)` : (findLike(mintFunction)?.match(/function\s+(.*\))/)?.[1] || mintFunction);
            }
        } else {
            // Default fallback
            mintFunction = 'mint(uint256)';
            console.warn("⚠️ No mint function specified. Defaulting to 'mint(uint256)'. If this fails, use 'contract load [addr] --func [name]'");
        }

        const contract = new Contract(address, abi, this.provider);

        // 3. Get Comprehensive Info (Optimized for Speed)

        // Helper: Race to find the first successful price
        const getPrice = async () => {
            try {
                return await Promise.any([
                    contract.cost(),
                    contract.price(),
                    contract.mintPrice(),
                    contract.salePrice(),
                    contract.tokenPrice(),
                    contract.MINT_PRICE(),
                    contract.PRICE(),
                    contract.value()
                ]);
            } catch {
                return BigInt(0);
            }
        };

        // Parallel Execution Groups
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
            contract.name().catch(() => 'Unknown'),
            contract.totalSupply().catch(() => BigInt(0)),
            contract.maxSupply().catch(() => BigInt(0)),
            getPrice(), // Fast race
            contract.paused().catch(() => false),
            contract.isActive().catch(() => true),
            contract.saleActive().catch(() => true),
            contract.maxPerWallet().catch(() => BigInt(0)),
            contract.walletLimit().catch(() => BigInt(0))
        ]);

        // Combined checks
        const isSalesActive = (!paused) && (isActive) && (saleActive);
        const effectiveMaxWallet = (maxPerWallet > 0n) ? maxPerWallet : walletLimit;

        return {
            address,
            abi,
            mintFunction,
            mintPrice: finalPrice,
            maxSupply: Number(maxSupply),
            currentSupply: Number(totalSupply),
            isActive: isSalesActive,
            requiresAllowlist: false, // Todo: check onlyWhitelisted
            name,
            chainId: (await this.provider.getNetwork()).chainId ? Number((await this.provider.getNetwork()).chainId) : 1,
            maxPerWallet: effectiveMaxWallet
        };
    }
}
