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

// NFTs2Me specific ABI fragments
const NFTS2ME_ABI = parseAbi([
    'function name() view returns (string)',
    'function totalSupply() view returns (uint256)',
    'function maxSupply() view returns (uint256)',
    'function mintingType() view returns (uint8)',
    'function mintFee(uint256 amount) view returns (uint256)',
    'function protocolFee() view returns (uint256)',
    'function saleIsActive() view returns (bool)',
    'function publicMintingEnabled() view returns (bool)',
    'function maxPerAddress() view returns (uint256)',
    'function mint(uint256 amount) payable',
] as const);

// Detection ABI - minimal checks to identify NFTs2Me
const DETECTION_ABI = parseAbi([
    'function protocolFee() view returns (uint256)',
    'function mintFee(uint256 amount) view returns (uint256)',
] as const);

/**
 * NFTs2Me Platform Module
 * 
 * NFTs2Me contracts have specific characteristics:
 * - protocolFee() function that returns a flat fee (usually ~0.0001 ETH)
 * - mintFee(uint256) function that returns price per token
 * - Total value = (mintFee * quantity) + protocolFee
 */
export class NFTs2MeModule implements PlatformModule {
    name = 'NFTs2Me';

    /**
     * Detect if contract is an NFTs2Me contract by checking for protocolFee function
     */
    async detect(address: string, chainId: number): Promise<boolean> {
        const chain = CHAINS[chainId] || mainnet;
        const publicClient = createPublicClient({
            chain,
            transport: http()
        });

        const contractAddress = address as `0x${string}`;

        try {
            // Try to call protocolFee() - this is unique to NFTs2Me
            await publicClient.readContract({
                address: contractAddress,
                abi: DETECTION_ABI,
                functionName: 'protocolFee',
            });

            // Also verify mintFee exists
            await publicClient.readContract({
                address: contractAddress,
                abi: DETECTION_ABI,
                functionName: 'mintFee',
                args: [BigInt(1)],
            });

            return true;
        } catch {
            return false;
        }
    }

    /**
     * Analyze NFTs2Me contract and return platform-specific info
     */
    async analyze(address: string, chainId: number): Promise<PlatformContractInfo> {
        const chain = CHAINS[chainId] || mainnet;
        const publicClient = createPublicClient({
            chain,
            transport: http()
        });

        const contractAddress = address as `0x${string}`;

        // Fetch all contract data in parallel
        const [
            name,
            totalSupply,
            maxSupply,
            protocolFee,
            mintFee,
            saleIsActive,
            maxPerAddress,
        ] = await Promise.all([
            publicClient.readContract({
                address: contractAddress,
                abi: NFTS2ME_ABI,
                functionName: 'name',
            }).catch(() => 'Unknown'),

            publicClient.readContract({
                address: contractAddress,
                abi: NFTS2ME_ABI,
                functionName: 'totalSupply',
            }).catch(() => BigInt(0)),

            publicClient.readContract({
                address: contractAddress,
                abi: NFTS2ME_ABI,
                functionName: 'maxSupply',
            }).catch(() => BigInt(0)),

            publicClient.readContract({
                address: contractAddress,
                abi: NFTS2ME_ABI,
                functionName: 'protocolFee',
            }).catch(() => BigInt(0)),

            publicClient.readContract({
                address: contractAddress,
                abi: NFTS2ME_ABI,
                functionName: 'mintFee',
                args: [BigInt(1)],
            }).catch(() => BigInt(0)),

            publicClient.readContract({
                address: contractAddress,
                abi: NFTS2ME_ABI,
                functionName: 'saleIsActive',
            }).catch(() =>
                // Fallback to publicMintingEnabled
                publicClient.readContract({
                    address: contractAddress,
                    abi: NFTS2ME_ABI,
                    functionName: 'publicMintingEnabled',
                }).catch(() => false)
            ),

            publicClient.readContract({
                address: contractAddress,
                abi: NFTS2ME_ABI,
                functionName: 'maxPerAddress',
            }).catch(() => BigInt(0)),
        ]);

        console.log(`📋 NFTs2Me Contract Analysis:`);
        console.log(`   Protocol Fee: ${protocolFee} wei`);
        console.log(`   Mint Fee (per token): ${mintFee} wei`);
        console.log(`   Sale Active: ${saleIsActive}`);

        return {
            address,
            name: name as string,
            chainId,
            platform: 'nfts2me',
            tokenStandard: 'ERC721',
            mintFunction: 'mint(uint256)',
            mintPrice: mintFee as bigint,
            protocolFee: protocolFee as bigint,
            creatorFee: BigInt(0),
            getTotalValue: (quantity: number) => {
                // NFTs2Me: (mintFee * quantity) + protocolFee
                // Protocol fee is per-transaction, not per-token
                return ((mintFee as bigint) * BigInt(quantity)) + (protocolFee as bigint);
            },
            isActive: saleIsActive as boolean,
            totalSupply: totalSupply as bigint,
            maxSupply: maxSupply as bigint,
            maxPerWallet: maxPerAddress as bigint,
        };
    }
}
