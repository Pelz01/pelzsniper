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

// Dutch Auction ABI (common patterns from WCNFT/Nakamigos style)
const DUTCH_AUCTION_ABI = parseAbi([
    // Detection - unique to Dutch Auction contracts
    'function getAuctionPrice() view returns (uint256)',
    'function auctionActive() view returns (bool)',

    // Alternative patterns
    'function dutchAuctionConfig() view returns (uint256 startPrice, uint256 endPrice, uint256 startTime, uint256 endTime)',
    'function currentPrice() view returns (uint256)',

    // Mint functions
    'function mintDutch(uint256 numberOfTokens) payable',
    'function auctionMint(uint256 quantity) payable',

    // Basic token info
    'function name() view returns (string)',
    'function totalSupply() view returns (uint256)',
    'function MAX_SUPPLY() view returns (uint256)',
    'function maxSupply() view returns (uint256)',
    'function MAX_TOKENS_PER_PURCHASE() view returns (uint256)',
    'function maxPerTransaction() view returns (uint256)',
] as const);

/**
 * Dutch Auction Module
 * 
 * Handles contracts that use stepped or linear Dutch auctions
 * Common in WCNFT-style drops (Nakamigos, etc.)
 */
export class DutchAuctionModule implements PlatformModule {
    name = 'DutchAuction';

    /**
     * Detect if contract uses Dutch Auction minting
     */
    async detect(address: string, chainId: number): Promise<boolean> {
        const chain = CHAINS[chainId] || mainnet;
        const publicClient = createPublicClient({
            chain,
            transport: http()
        });

        const contractAddress = address as `0x${string}`;

        try {
            // Check for getAuctionPrice() which is the hallmark of Dutch auctions
            await publicClient.readContract({
                address: contractAddress,
                abi: DUTCH_AUCTION_ABI,
                functionName: 'getAuctionPrice',
            });
            console.log(`✅ Detected Dutch Auction contract via getAuctionPrice()`);
            return true;
        } catch {
            // Try alternative: currentPrice()
            try {
                await publicClient.readContract({
                    address: contractAddress,
                    abi: DUTCH_AUCTION_ABI,
                    functionName: 'currentPrice',
                });
                console.log(`✅ Detected Dutch Auction contract via currentPrice()`);
                return true;
            } catch {
                return false;
            }
        }
    }

    /**
     * Analyze Dutch Auction contract
     */
    async analyze(address: string, chainId: number): Promise<PlatformContractInfo> {
        const chain = CHAINS[chainId] || mainnet;
        const publicClient = createPublicClient({
            chain,
            transport: http()
        });

        const contractAddress = address as `0x${string}`;

        // Get basic token info
        const [name, totalSupply] = await Promise.all([
            publicClient.readContract({
                address: contractAddress,
                abi: DUTCH_AUCTION_ABI,
                functionName: 'name',
            }).catch(() => 'Unknown'),
            publicClient.readContract({
                address: contractAddress,
                abi: DUTCH_AUCTION_ABI,
                functionName: 'totalSupply',
            }).catch(() => BigInt(0)),
        ]);

        // Try to get max supply (various patterns)
        let maxSupply = BigInt(0);
        try {
            maxSupply = await publicClient.readContract({
                address: contractAddress,
                abi: DUTCH_AUCTION_ABI,
                functionName: 'MAX_SUPPLY',
            }) as bigint;
        } catch {
            try {
                maxSupply = await publicClient.readContract({
                    address: contractAddress,
                    abi: DUTCH_AUCTION_ABI,
                    functionName: 'maxSupply',
                }) as bigint;
            } catch { }
        }

        // Get current auction price
        let mintPrice = BigInt(0);
        try {
            mintPrice = await publicClient.readContract({
                address: contractAddress,
                abi: DUTCH_AUCTION_ABI,
                functionName: 'getAuctionPrice',
            }) as bigint;
        } catch {
            try {
                mintPrice = await publicClient.readContract({
                    address: contractAddress,
                    abi: DUTCH_AUCTION_ABI,
                    functionName: 'currentPrice',
                }) as bigint;
            } catch {
                console.warn("Could not get current auction price");
            }
        }

        // Check if auction is active
        let isActive = false;
        try {
            isActive = await publicClient.readContract({
                address: contractAddress,
                abi: DUTCH_AUCTION_ABI,
                functionName: 'auctionActive',
            }) as boolean;
        } catch {
            // If we got a price, assume it's active
            isActive = mintPrice > BigInt(0);
        }

        // Determine mint function - try mintDutch first, then auctionMint
        let mintFunction = 'mintDutch(uint256)';
        // We'll try to detect which one exists by checking bytecode selector later
        // For now, default to mintDutch which is more common

        // Get max per transaction if available
        let maxPerWallet: bigint | undefined;
        try {
            maxPerWallet = await publicClient.readContract({
                address: contractAddress,
                abi: DUTCH_AUCTION_ABI,
                functionName: 'MAX_TOKENS_PER_PURCHASE',
            }) as bigint;
        } catch {
            try {
                maxPerWallet = await publicClient.readContract({
                    address: contractAddress,
                    abi: DUTCH_AUCTION_ABI,
                    functionName: 'maxPerTransaction',
                }) as bigint;
            } catch { }
        }

        return {
            address,
            name: name as string,
            chainId,
            platform: 'dutchauction' as any,
            tokenStandard: 'ERC721',
            mintFunction,
            mintPrice,
            protocolFee: BigInt(0),
            creatorFee: BigInt(0),
            getTotalValue: (quantity: number) => mintPrice * BigInt(quantity),
            isActive,
            totalSupply: totalSupply as bigint,
            maxSupply,
            maxPerWallet,
        };
    }
}
