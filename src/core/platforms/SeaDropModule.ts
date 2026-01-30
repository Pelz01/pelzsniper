import { createPublicClient, parseAbi, type Chain } from 'viem';
import { getProviderTransport } from '../../config/transport';
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

// SeaDrop singleton contract addresses by chain
const SEADROP_ADDRESSES: Record<number, string> = {
    1: '0x00005EA00Ac477B1030CE78506496e8C2dE24bf5',      // Mainnet
    11155111: '0x00005EA00Ac477B1030CE78506496e8C2dE24bf5', // Sepolia (same address)
    137: '0x00005EA00Ac477B1030CE78506496e8C2dE24bf5',     // Polygon
    8453: '0x00005EA00Ac477B1030CE78506496e8C2dE24bf5',    // Base
};

// Token contract ABI for SeaDrop detection
const TOKEN_DETECTION_ABI = parseAbi([
    'function supportsInterface(bytes4 interfaceId) view returns (bool)',
    'function getSeaDrops() view returns (address[])',
] as const);

// Token contract ABI for reading data
const TOKEN_ABI = parseAbi([
    'function name() view returns (string)',
    'function totalSupply() view returns (uint256)',
    'function maxSupply() view returns (uint256)',
] as const);

// SeaDrop singleton ABI
const SEADROP_ABI = parseAbi([
    'function getPublicDrop(address tokenContract) view returns ((uint80 mintPrice, uint48 startTime, uint48 endTime, uint16 maxTotalMintableByWallet, uint16 feeBps, bool restrictFeeRecipients))',
    'function mintPublic(address tokenContract, address feeRecipient, address minterIfNotPayer, uint256 quantity) payable',
] as const);

// ERC721SeaDrop interface ID
const ISEADROP_TOKEN_INTERFACE = '0x1890fe8e';

/**
 * SeaDrop Platform Module (OpenSea Drops / Magic Eden SeaDrop)
 * 
 * SeaDrop uses a singleton pattern:
 * - Token contracts register with the SeaDrop singleton
 * - Minting is done via the singleton, not the token contract directly
 * - Public drops have configurable price, time windows, and limits
 */
export class SeaDropModule implements PlatformModule {
    name = 'OpenSea';

    /**
     * Detect if contract is a SeaDrop-compatible token
     */
    async detect(address: string, chainId: number): Promise<boolean> {
        const chain = CHAINS[chainId] || mainnet;
        const publicClient = createPublicClient({
            chain,
            transport: getProviderTransport(chainId)
        });

        const contractAddress = address as `0x${string}`;

        // Method 1: Check for ISeaDropTokenContractMetadata interface
        try {
            const supportsSeaDrop = await publicClient.readContract({
                address: contractAddress,
                abi: TOKEN_DETECTION_ABI,
                functionName: 'supportsInterface',
                args: [ISEADROP_TOKEN_INTERFACE as `0x${string}`],
            });

            if (supportsSeaDrop) {
                console.log(`✅ Detected SeaDrop via supportsInterface`);
                return true;
            }
        } catch { }

        // Method 2: Check if getSeaDrops() exists and returns addresses
        try {
            const seaDrops = await publicClient.readContract({
                address: contractAddress,
                abi: TOKEN_DETECTION_ABI,
                functionName: 'getSeaDrops',
            });

            if (Array.isArray(seaDrops) && seaDrops.length > 0) {
                console.log(`✅ Detected SeaDrop via getSeaDrops()`);
                return true;
            }
        } catch { }

        // Method 3: Check for mintSeaDrop function (unique to SeaDrop contracts)
        // This works for ERC721SeaDropCloneable proxies
        try {
            // Check bytecode for SeaDrop function selectors
            const bytecode = await publicClient.getCode({ address: contractAddress });


            if (bytecode) {
                // Check for mintSeaDrop selector (0x64869dad) in bytecode
                // or getAllowedSeaDrop selector (0x4f2c436d)
                const MINT_SEADROP_SELECTOR = '64869dad';
                const GET_ALLOWED_SEADROP_SELECTOR = '4f2c436d';

                const bytecodeStr = bytecode.toLowerCase();
                if (bytecodeStr.includes(MINT_SEADROP_SELECTOR) ||
                    bytecodeStr.includes(GET_ALLOWED_SEADROP_SELECTOR)) {
                    console.log(`✅ Detected SeaDrop via bytecode selector`);
                    return true;
                }
            }
        } catch { }

        // Method 4: For minimal proxies, check the implementation
        try {
            const bytecode = await publicClient.getCode({ address: contractAddress });
            if (bytecode && bytecode.length < 100) {
                // This is likely a minimal proxy (EIP-1167)
                // Check if it delegates to a SeaDrop implementation
                // Minimal proxy bytecode: 363d3d373d3d3d363d73<address>5af43d82803e903d91602b57fd5bf3
                const match = bytecode.toLowerCase().match(/363d3d373d3d3d363d73([a-f0-9]{40})5af43d82803e903d91602b57fd5bf3/);
                if (match) {
                    const implementationAddress = `0x${match[1]}` as `0x${string}`;
                    console.log(`📦 Minimal Proxy detected, checking implementation: ${implementationAddress}`);

                    // Check if implementation has SeaDrop functions
                    const implBytecode = await publicClient.getCode({ address: implementationAddress });
                    if (implBytecode) {
                        const implStr = implBytecode.toLowerCase();
                        if (implStr.includes('64869dad') || implStr.includes('4f2c436d')) {
                            console.log(`✅ Detected SeaDrop via proxy implementation`);
                            return true;
                        }
                    }
                }
            }
        } catch { }

        return false;
    }

    /**
     * Analyze SeaDrop contract and return platform-specific info
     */
    async analyze(address: string, chainId: number): Promise<PlatformContractInfo> {
        const chain = CHAINS[chainId] || mainnet;
        const publicClient = createPublicClient({
            chain,
            transport: getProviderTransport(chainId)
        });

        const contractAddress = address as `0x${string}`;
        const seaDropAddress = SEADROP_ADDRESSES[chainId] || SEADROP_ADDRESSES[1];

        // Fetch token data
        const [name, totalSupply, maxSupply] = await Promise.all([
            publicClient.readContract({
                address: contractAddress,
                abi: TOKEN_ABI,
                functionName: 'name',
            }).catch(() => 'Unknown'),

            publicClient.readContract({
                address: contractAddress,
                abi: TOKEN_ABI,
                functionName: 'totalSupply',
            }).catch(() => BigInt(0)),

            publicClient.readContract({
                address: contractAddress,
                abi: TOKEN_ABI,
                functionName: 'maxSupply',
            }).catch(() => BigInt(0)),
        ]);

        // Fetch public drop info from SeaDrop singleton
        let mintPrice = BigInt(0);
        let isActive = false;
        let maxPerWallet = BigInt(0);

        try {
            const publicDrop = await publicClient.readContract({
                address: seaDropAddress as `0x${string}`,
                abi: SEADROP_ABI,
                functionName: 'getPublicDrop',
                args: [contractAddress],
            });

            mintPrice = BigInt(publicDrop.mintPrice);
            maxPerWallet = BigInt(publicDrop.maxTotalMintableByWallet);

            // Check if currently active (startTime <= now <= endTime)
            const now = BigInt(Math.floor(Date.now() / 1000));
            const startTime = BigInt(publicDrop.startTime);
            const endTime = BigInt(publicDrop.endTime);
            isActive = now >= startTime && now <= endTime;

            console.log(`📋 SeaDrop Contract Analysis:`);
            console.log(`   Mint Price: ${mintPrice} wei`);
            console.log(`   Active: ${isActive} (${startTime} - ${endTime})`);
            console.log(`   Max Per Wallet: ${maxPerWallet}`);
        } catch (e) {
            console.warn(`⚠️ Could not fetch public drop info:`, e);
        }

        return {
            address,
            name: name as string,
            chainId,
            platform: 'opensea',
            tokenStandard: 'ERC721',
            mintFunction: 'mintPublic', // Called on SeaDrop singleton
            mintPrice,
            protocolFee: BigInt(0), // SeaDrop fees are handled internally
            creatorFee: BigInt(0),
            getTotalValue: (quantity: number) => mintPrice * BigInt(quantity),
            isActive,
            totalSupply: totalSupply as bigint,
            maxSupply: maxSupply as bigint,
            maxPerWallet,
            routerContract: seaDropAddress, // The SeaDrop singleton to call
        };
    }

    /**
     * Get the SeaDrop singleton address for a chain
     */
    getSeaDropAddress(chainId: number): string {
        return SEADROP_ADDRESSES[chainId] || SEADROP_ADDRESSES[1];
    }
}
