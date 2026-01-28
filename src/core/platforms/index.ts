// Platform Module Exports
export { PlatformManager, getPlatformManager } from './PlatformManager';
export type { PlatformModule, PlatformContractInfo } from './PlatformManager';

// Individual Platform Modules
export { NFTs2MeModule } from './NFTs2MeModule';
export { SeaDropModule } from './SeaDropModule';
export { MagicEdenModule } from './MagicEdenModule';
export { ScatterModule } from './ScatterModule';
export { DutchAuctionModule } from './DutchAuctionModule';
export { ThirdwebModule } from './ThirdwebModule';
export { ZoraModule } from './ZoraModule';
export { ManifoldModule } from './ManifoldModule';

// Initialize all modules with the platform manager
import { getPlatformManager } from './PlatformManager';
import { NFTs2MeModule } from './NFTs2MeModule';
import { SeaDropModule } from './SeaDropModule';
import { MagicEdenModule } from './MagicEdenModule';
import { ScatterModule } from './ScatterModule';
import { DutchAuctionModule } from './DutchAuctionModule';
import { ThirdwebModule } from './ThirdwebModule';
import { ZoraModule } from './ZoraModule';
import { ManifoldModule } from './ManifoldModule';

/**
 * Initialize the platform manager with all available modules
 * Call this once at app startup
 */
export function initializePlatformModules(chainId?: number): void {
    const manager = getPlatformManager(chainId);

    // Register all platform modules (order matters - more specific first)
    manager.registerModule(new NFTs2MeModule());
    manager.registerModule(new SeaDropModule());
    manager.registerModule(new MagicEdenModule());
    manager.registerModule(new ScatterModule());
    manager.registerModule(new DutchAuctionModule());
    manager.registerModule(new ThirdwebModule());
    manager.registerModule(new ZoraModule());
    manager.registerModule(new ManifoldModule());

    console.log('✅ Platform modules initialized:', manager.getRegisteredPlatforms());
}
