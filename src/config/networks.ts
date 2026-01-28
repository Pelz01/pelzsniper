export interface NetworkConfig {
    id: number;
    name: string;
    hex: string;
    rpc: string;
    explorer: string;
    nativeCurrency: {
        name: string;
        symbol: string;
        decimals: number;
    };
}

export const NETWORKS: Record<string, NetworkConfig> = {
    mainnet: {
        id: 1,
        name: "Ethereum Mainnet",
        hex: "0x1",
        rpc: "https://eth.llamarpc.com",
        explorer: "https://etherscan.io",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }
    },
    sepolia: {
        id: 11155111,
        name: "Sepolia Testnet",
        hex: "0xaa36a7",
        rpc: "https://rpc.sepolia.org",
        explorer: "https://sepolia.etherscan.io",
        nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 }
    },
    base: {
        id: 8453,
        name: "Base",
        hex: "0x2105",
        rpc: "https://mainnet.base.org",
        explorer: "https://basescan.org",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }
    },
    base_sepolia: {
        id: 84532,
        name: "Base Sepolia",
        hex: "0x14a34",
        rpc: "https://sepolia.base.org",
        explorer: "https://sepolia.basescan.org",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }
    },
    polygon: {
        id: 137,
        name: "Polygon",
        hex: "0x89",
        rpc: "https://polygon-rpc.com",
        explorer: "https://polygonscan.com",
        nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 }
    },
    arbitrum: {
        id: 42161,
        name: "Arbitrum One",
        hex: "0xa4b1",
        rpc: "https://arb1.arbitrum.io/rpc",
        explorer: "https://arbiscan.io",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }
    },
    abstract: {
        id: 2741,
        name: "Abstract",
        hex: "0xab5",
        rpc: "https://api.mainnet.abs.xyz",
        explorer: "https://abscan.org",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }
    },
    hyperliquid: {
        id: 999,
        name: "Hyperliquid EVM",
        hex: "0x3e7",
        rpc: "https://rpc.hyperliquid.xyz/evm",
        explorer: "https://hyperevmscan.io",
        nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 }
    },
    megaeth: {
        id: 4326,
        name: "MegaETH Mainnet",
        hex: "0x10e6",
        rpc: "https://mainnet.megaeth.com/rpc",
        explorer: "https://mega.etherscan.com",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }
    }
};
