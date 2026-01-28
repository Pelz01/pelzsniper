import { createPublicClient, http, parseAbi, type Chain, keccak256, toBytes } from 'viem';
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

// ArchetypeErc721a ABI (Scatter.art uses this)
const ARCHETYPE_ABI = parseAbi([
    // Detection - unique to Archetype
    'function platform() view returns (address)',

    // Price computation
    'function computePrice(bytes32 key, uint256 quantity, bool affiliateUsed) view returns (uint256)',

    // Invites mapping getter (for checking if list exists)
    'function invites(bytes32 key) view returns (uint128 price, uint128 reservePrice, uint64 delta, uint32 start, uint32 end, uint32 limit, uint32 maxSupply, uint32 interval, uint32 unitSize, address tokenAddress, bool isBlacklist)',

    // Basic token info
    'function name() view returns (string)',
    'function totalSupply() view returns (uint256)',
    'function config() view returns (string baseUri, address affiliateSigner, uint32 maxSupply, uint32 maxBatchSize, uint16 affiliateFee, uint16 affiliateDiscount, uint16 defaultRoyalty)',
] as const);

/**
 * Scatter.art / Archetype Module
 * 
 * Handles ArchetypeErc721a contracts used by Scatter.art.
 * These use invite-based minting with computed prices.
 */
export class ScatterModule implements PlatformModule {
    name = 'Scatter';

    /**
     * Detect if contract is an Archetype/Scatter collection
     */
    async detect(address: string, chainId: number): Promise<boolean> {
        const chain = CHAINS[chainId] || mainnet;
        const publicClient = createPublicClient({
            chain,
            transport: http()
        });

        const contractAddress = address as `0x${string}`;

        try {
            // Check for platform() function which returns the Archetype platform address
            const platform = await publicClient.readContract({
                address: contractAddress,
                abi: ARCHETYPE_ABI,
                functionName: 'platform',
            });

            // Verify it's an Archetype platform (or just that it has this function)
            if (platform) {
                console.log(`✅ Detected Archetype contract, platform: ${platform}`);
                return true;
            }
            return false;
        } catch {
            return false;
        }
    }

    /**
     * Analyze Scatter/Archetype contract
     */
    async analyze(address: string, chainId: number): Promise<PlatformContractInfo> {
        const chain = CHAINS[chainId] || mainnet;
        const publicClient = createPublicClient({
            chain,
            transport: http()
        });

        const contractAddress = address as `0x${string}`;

        // Get basic token info
        const [name, totalSupply, config] = await Promise.all([
            publicClient.readContract({
                address: contractAddress,
                abi: ARCHETYPE_ABI,
                functionName: 'name',
            }).catch(() => 'Unknown'),
            publicClient.readContract({
                address: contractAddress,
                abi: ARCHETYPE_ABI,
                functionName: 'totalSupply',
            }).catch(() => BigInt(0)),
            publicClient.readContract({
                address: contractAddress,
                abi: ARCHETYPE_ABI,
                functionName: 'config',
            }).catch(() => null),
        ]);

        let maxSupply = BigInt(0);
        if (config && Array.isArray(config)) {
            maxSupply = BigInt(config[2] || 0); // maxSupply is 3rd element
        }

        // Try to get price for quantity 1 using "public" list key
        // Common keys: bytes32(0), keccak256("public"), keccak256("default")
        const publicKey = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`;

        let mintPrice = BigInt(0);
        let isActive = false;

        // Try to compute price for 1 token
        try {
            mintPrice = await publicClient.readContract({
                address: contractAddress,
                abi: ARCHETYPE_ABI,
                functionName: 'computePrice',
                args: [publicKey, BigInt(1), false], // 1 quantity, no affiliate
            }) as bigint;

            console.log(`📊 Computed price for key 0x00...00: ${mintPrice}`);
        } catch (e) {
            console.warn("Failed to compute price for default key, trying others...");

            // Try "public" key
            const publicKeyHash = keccak256(toBytes('public'));
            try {
                mintPrice = await publicClient.readContract({
                    address: contractAddress,
                    abi: ARCHETYPE_ABI,
                    functionName: 'computePrice',
                    args: [publicKeyHash, BigInt(1), false],
                }) as bigint;
                console.log(`📊 Computed price for 'public' key: ${mintPrice}`);
            } catch {
                console.warn("Could not compute price for any known key");
            }
        }

        // Check if invite is active by reading invites mapping
        try {
            const invite = await publicClient.readContract({
                address: contractAddress,
                abi: ARCHETYPE_ABI,
                functionName: 'invites',
                args: [publicKey],
            }) as any;

            // Check start/end times
            const now = Math.floor(Date.now() / 1000);
            const start = Number(invite[3] || 0); // start is 4th element
            const end = Number(invite[4] || 0);   // end is 5th element

            isActive = start <= now && (end === 0 || end > now);

            // If we didn't get price from computePrice, get it from invite
            if (mintPrice === BigInt(0)) {
                mintPrice = BigInt(invite[0] || 0); // price is 1st element
            }

            console.log(`📊 Invite data: price=${invite[0]}, start=${start}, end=${end}, isActive=${isActive}`);
        } catch (e) {
            console.warn("Failed to read invites:", e);
        }

        // Archetype mint function signature
        // mint(Auth calldata auth, uint256 quantity, address affiliate, bytes calldata signature)
        // For public mints with empty auth: auth = { key: bytes32(0), proof: [] }
        const mintFunction = 'mint((bytes32,bytes32[]),uint256,address,bytes)';

        return {
            address,
            name: name as string,
            chainId,
            platform: 'scatter' as any, // Will need to add 'scatter' to type
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
