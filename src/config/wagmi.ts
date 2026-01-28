import { http, createConfig, createStorage } from 'wagmi';
import { mainnet, sepolia, goerli, polygon, arbitrum, optimism, base } from 'wagmi/chains';
import { injected, coinbaseWallet } from 'wagmi/connectors';

// Wagmi config with popular EVM chains for NFT minting
export const config = createConfig({
    chains: [mainnet, sepolia, goerli, polygon, arbitrum, optimism, base],
    connectors: [
        injected({
            shimDisconnect: true,
        }),
        coinbaseWallet({
            appName: 'PelzNFT Sniper',
        }),
    ],
    storage: createStorage({ storage: window.localStorage }),
    transports: {
        [mainnet.id]: http(),
        [sepolia.id]: http(),
        [goerli.id]: http(),
        [polygon.id]: http(),
        [arbitrum.id]: http(),
        [optimism.id]: http(),
        [base.id]: http(),
    },
});

// Export chain list for reference
export const supportedChains = config.chains;

// Type exports for use elsewhere
declare module 'wagmi' {
    interface Register {
        config: typeof config;
    }
}
