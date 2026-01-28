import { createPublicClient, http, parseAbi, type Chain } from 'viem';
import { mainnet, sepolia, goerli, polygon, arbitrum, optimism, base } from 'viem/chains';
import type { PlatformModule, PlatformContractInfo } from './PlatformManager';

// Chain lookup
const CHAINS: Record<number, Chain> = {
    1: mainnet,
    11155111: sepolia,
    5: goerli,
    137: polygon,
    42161: arbitrum,
    10: optimism,
    8453: base,
};

// Zora Drop ABI patterns (Zora Creator contracts)
const ZORA_ABI = parseAbi([
    // Detection - Zora contracts have zoraFeeManager
    'function zoraFeeForAmount(uint256 quantity) view returns (address recipient, uint256 fee)',
    'function mintFee() view returns (uint256)',

    // Sales config
    'function salesConfig() view returns (uint104 publicSalePrice, uint32 maxSalePurchasePerAddress, uint64 publicSaleStart, uint64 publicSaleEnd, uint64 presaleStart, uint64 presaleEnd, bytes32 presaleMerkleRoot)',

    // Mint functions
    'function purchase(uint256 quantity) payable returns (uint256)',
    'function purchaseWithComment(uint256 quantity, string comment) payable returns (uint256)',
    'function mintWithRewards(address recipient, uint256 quantity, string comment, address mintReferral) payable returns (uint256)',

    // Basic info
    'function name() view returns (string)',
    'function totalSupply() view returns (uint256)',
    'function config() view returns (address metadataRenderer, uint64 editionSize, uint16 royaltyBPS, address fundsRecipient)',
] as const);

/**
 * Zora Module
 * 
 * Handles Zora Editions and Creator contracts.
 * Zora has specific fee structures and purchase functions.
 */
export class ZoraModule implements PlatformModule {
    name = 'Zora';

    async detect(address: string, chainId: number): Promise<boolean> {
        const chain = CHAINS[chainId] || mainnet;
        const publicClient = createPublicClient({
            chain,
            transport: http()
        });

        const contractAddress = address as `0x${string}`;

        try {
            // Check for zoraFeeForAmount which is unique to Zora
            await publicClient.readContract({
                address: contractAddress,
                abi: ZORA_ABI,
                functionName: 'zoraFeeForAmount',
                args: [BigInt(1)],
            });
            console.log(`✅ Detected Zora contract via zoraFeeForAmount()`);
            return true;
        } catch {
            // Try salesConfig
            try {
                const config = await publicClient.readContract({
                    address: contractAddress,
                    abi: ZORA_ABI,
                    functionName: 'salesConfig',
                });
                if (config) {
                    console.log(`✅ Detected Zora contract via salesConfig()`);
                    return true;
                }
            } catch { }
            return false;
        }
    }

    async analyze(address: string, chainId: number): Promise<PlatformContractInfo> {
        const chain = CHAINS[chainId] || mainnet;
        const publicClient = createPublicClient({
            chain,
            transport: http()
        });

        const contractAddress = address as `0x${string}`;

        // Get basic info
        const [name, totalSupply] = await Promise.all([
            publicClient.readContract({
                address: contractAddress,
                abi: ZORA_ABI,
                functionName: 'name',
            }).catch(() => 'Unknown'),
            publicClient.readContract({
                address: contractAddress,
                abi: ZORA_ABI,
                functionName: 'totalSupply',
            }).catch(() => BigInt(0)),
        ]);

        let maxSupply = BigInt(0);
        try {
            const config = await publicClient.readContract({
                address: contractAddress,
                abi: ZORA_ABI,
                functionName: 'config',
            }) as any;
            if (config) {
                maxSupply = BigInt(config.editionSize || config[1] || 0);
            }
        } catch { }

        // Get sales config for price
        let mintPrice = BigInt(0);
        let isActive = false;
        let maxPerWallet: bigint | undefined;

        try {
            const salesConfig = await publicClient.readContract({
                address: contractAddress,
                abi: ZORA_ABI,
                functionName: 'salesConfig',
            }) as any;

            if (salesConfig) {
                mintPrice = BigInt(salesConfig.publicSalePrice || salesConfig[0] || 0);
                maxPerWallet = BigInt(salesConfig.maxSalePurchasePerAddress || salesConfig[1] || 0);

                const now = BigInt(Math.floor(Date.now() / 1000));
                const start = BigInt(salesConfig.publicSaleStart || salesConfig[2] || 0);
                const end = BigInt(salesConfig.publicSaleEnd || salesConfig[3] || 0);

                isActive = now >= start && (end === BigInt(0) || now < end);
            }
        } catch (e) {
            console.warn("Failed to get sales config:", e);
        }

        // Get Zora protocol fee
        let protocolFee = BigInt(0);
        try {
            const feeInfo = await publicClient.readContract({
                address: contractAddress,
                abi: ZORA_ABI,
                functionName: 'zoraFeeForAmount',
                args: [BigInt(1)],
            }) as any;
            if (feeInfo) {
                protocolFee = BigInt(feeInfo.fee || feeInfo[1] || 0);
            }
        } catch { }

        // Zora uses purchase(uint256), often with mintFee included
        const mintFunction = 'purchase(uint256)';

        return {
            address,
            name: name as string,
            chainId,
            platform: 'zora' as any,
            tokenStandard: 'ERC721',
            mintFunction,
            mintPrice,
            protocolFee,
            creatorFee: BigInt(0),
            getTotalValue: (quantity: number) => (mintPrice + protocolFee) * BigInt(quantity),
            isActive,
            totalSupply: totalSupply as bigint,
            maxSupply,
            maxPerWallet,
        };
    }
}
