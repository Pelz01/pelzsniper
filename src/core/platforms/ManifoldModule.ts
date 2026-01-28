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

// Foundation/Manifold ABI patterns
const MANIFOLD_ABI = parseAbi([
    // Detection - Manifold contracts have these
    'function MINT_FEE() view returns (uint256)',
    'function MINT_FEE_MERKLE() view returns (uint256)',

    // Claim extension functions
    'function getClaim(address creatorContractAddress, uint256 instanceId) view returns ((uint32 total, uint32 totalMax, uint32 walletMax, uint48 startDate, uint48 endDate, uint8 storageProtocol, bytes32 merkleRoot, string location, uint256 tokenId, uint256 cost, address payable paymentReceiver, address erc20))',

    // Mint functions (called on the extension contract)
    'function mint(address creatorContractAddress, uint256 instanceId, uint32 mintCount, uint32[] mintIndices, bytes32[][] merkleProofs, address mintFor) payable',
    'function mintBatch(address creatorContractAddress, uint256 instanceId, uint16 mintCount, uint32[] mintIndices, bytes32[][] merkleProofs, address mintFor) payable',

    // Basic info (on the NFT contract itself)
    'function name() view returns (string)',
    'function totalSupply() view returns (uint256)',
] as const);

/**
 * Manifold Module
 * 
 * Handles Manifold Creator contracts and claim extensions.
 * Used by Foundation and many artists.
 */
export class ManifoldModule implements PlatformModule {
    name = 'Manifold';

    async detect(address: string, chainId: number): Promise<boolean> {
        const chain = CHAINS[chainId] || mainnet;
        const publicClient = createPublicClient({
            chain,
            transport: http()
        });

        const contractAddress = address as `0x${string}`;

        try {
            // Check for MINT_FEE which is unique to Manifold claim extensions
            await publicClient.readContract({
                address: contractAddress,
                abi: MANIFOLD_ABI,
                functionName: 'MINT_FEE',
            });
            console.log(`✅ Detected Manifold contract via MINT_FEE()`);
            return true;
        } catch {
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

        const [name, totalSupply] = await Promise.all([
            publicClient.readContract({
                address: contractAddress,
                abi: MANIFOLD_ABI,
                functionName: 'name',
            }).catch(() => 'Unknown'),
            publicClient.readContract({
                address: contractAddress,
                abi: MANIFOLD_ABI,
                functionName: 'totalSupply',
            }).catch(() => BigInt(0)),
        ]);

        // Get Manifold protocol fee
        let protocolFee = BigInt(0);
        try {
            protocolFee = await publicClient.readContract({
                address: contractAddress,
                abi: MANIFOLD_ABI,
                functionName: 'MINT_FEE',
            }) as bigint;
        } catch { }

        // Note: Manifold claim minting is complex - requires extension contract + instance ID
        // For now, we detect it but user may need to use specific extension contracts
        const mintFunction = 'mint(address,uint256,uint32,uint32[],bytes32[][],address)';

        return {
            address,
            name: name as string,
            chainId,
            platform: 'manifold' as any,
            tokenStandard: 'ERC721',
            mintFunction,
            mintPrice: BigInt(0), // Price is per-claim, need instanceId
            protocolFee,
            creatorFee: BigInt(0),
            getTotalValue: (quantity: number) => protocolFee * BigInt(quantity),
            isActive: true, // Would need specific claim check
            totalSupply: totalSupply as bigint,
            maxSupply: BigInt(0),
        };
    }
}
