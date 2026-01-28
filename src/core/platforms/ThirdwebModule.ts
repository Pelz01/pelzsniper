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

// Thirdweb Drop ABI patterns
const THIRDWEB_ABI = parseAbi([
    // Detection - Thirdweb contracts have these
    'function contractURI() view returns (string)',
    'function contractType() view returns (bytes32)',
    'function contractVersion() view returns (uint8)',

    // Claim conditions (Thirdweb signature)
    'function getActiveClaimConditionId() view returns (uint256)',
    'function getClaimConditionById(uint256 conditionId) view returns ((uint256 startTimestamp, uint256 maxClaimableSupply, uint256 supplyClaimed, uint256 quantityLimitPerWallet, bytes32 merkleRoot, uint256 pricePerToken, address currency, string metadata))',

    // Mint function
    'function claim(address receiver, uint256 quantity, address currency, uint256 pricePerToken, (bytes32[] proof, uint256 quantityLimitPerWallet, uint256 pricePerToken, address currency) allowlistProof, bytes data) payable',

    // Simpler claim
    'function claim(address to, uint256 quantity) payable',

    // Basic info
    'function name() view returns (string)',
    'function totalSupply() view returns (uint256)',
    'function nextTokenIdToMint() view returns (uint256)',
    'function maxTotalSupply() view returns (uint256)',
] as const);

/**
 * Thirdweb Module
 * 
 * Handles Thirdweb NFT Drop and Edition Drop contracts.
 * Uses claim conditions for pricing and eligibility.
 */
export class ThirdwebModule implements PlatformModule {
    name = 'Thirdweb';

    async detect(address: string, chainId: number): Promise<boolean> {
        const chain = CHAINS[chainId] || mainnet;
        const publicClient = createPublicClient({
            chain,
            transport: http()
        });

        const contractAddress = address as `0x${string}`;

        try {
            // Check for contractType which is unique to Thirdweb
            const contractType = await publicClient.readContract({
                address: contractAddress,
                abi: THIRDWEB_ABI,
                functionName: 'contractType',
            });

            // Thirdweb contract types include: NFTDrop, EditionDrop, etc.
            if (contractType) {
                console.log(`✅ Detected Thirdweb contract, type: ${contractType}`);
                return true;
            }
            return false;
        } catch {
            // Try alternative: getActiveClaimConditionId
            try {
                await publicClient.readContract({
                    address: contractAddress,
                    abi: THIRDWEB_ABI,
                    functionName: 'getActiveClaimConditionId',
                });
                console.log(`✅ Detected Thirdweb contract via claim conditions`);
                return true;
            } catch {
                return false;
            }
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
                abi: THIRDWEB_ABI,
                functionName: 'name',
            }).catch(() => 'Unknown'),
            publicClient.readContract({
                address: contractAddress,
                abi: THIRDWEB_ABI,
                functionName: 'totalSupply',
            }).catch(() => BigInt(0)),
        ]);

        let maxSupply = BigInt(0);
        try {
            maxSupply = await publicClient.readContract({
                address: contractAddress,
                abi: THIRDWEB_ABI,
                functionName: 'maxTotalSupply',
            }) as bigint;
        } catch { }

        // Get current claim condition for price
        let mintPrice = BigInt(0);
        let isActive = false;

        try {
            const conditionId = await publicClient.readContract({
                address: contractAddress,
                abi: THIRDWEB_ABI,
                functionName: 'getActiveClaimConditionId',
            }) as bigint;

            const condition = await publicClient.readContract({
                address: contractAddress,
                abi: THIRDWEB_ABI,
                functionName: 'getClaimConditionById',
                args: [conditionId],
            }) as any;

            if (condition) {
                mintPrice = BigInt(condition.pricePerToken || condition[5] || 0);
                isActive = true;
            }
        } catch (e) {
            console.warn("Failed to get claim condition:", e);
        }

        // Thirdweb uses claim(address, uint256) for simple claims
        const mintFunction = 'claim(address,uint256)';

        return {
            address,
            name: name as string,
            chainId,
            platform: 'thirdweb' as any,
            tokenStandard: 'ERC721',
            mintFunction,
            mintPrice,
            protocolFee: BigInt(0),
            creatorFee: BigInt(0),
            getTotalValue: (quantity: number) => mintPrice * BigInt(quantity),
            isActive,
            totalSupply: totalSupply as bigint,
            maxSupply,
        };
    }
}
