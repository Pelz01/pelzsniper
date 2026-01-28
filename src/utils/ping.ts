/**
 * RPC Latency Testing Utility
 * Measures roundtrip time for RPC calls
 */
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

export interface PingResult {
    url: string;
    latency: number; // in milliseconds
    success: boolean;
    error?: string;
}

export interface PingStats {
    url: string;
    avg: number;
    min: number;
    max: number;
    failures: number;
    total: number;
}

/**
 * Measure latency for a single RPC call
 */
export async function measureLatency(url: string): Promise<PingResult> {
    const start = performance.now();

    try {
        const client = createPublicClient({
            chain: mainnet,
            transport: http(url)
        });

        // Make lightweight call
        await client.getBlockNumber();

        const end = performance.now();
        const latency = Math.round(end - start);

        return {
            url,
            latency,
            success: true
        };
    } catch (e: any) {
        return {
            url,
            latency: -1,
            success: false,
            error: e.message || 'Connection failed'
        };
    }
}

/**
 * Run multiple ping tests and calculate statistics
 */
export async function pingMultiple(url: string, iterations: number = 5): Promise<PingStats> {
    const results: PingResult[] = [];

    for (let i = 0; i < iterations; i++) {
        const result = await measureLatency(url);
        results.push(result);

        // Small delay between pings
        if (i < iterations - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    const successful = results.filter(r => r.success);
    const latencies = successful.map(r => r.latency);

    return {
        url,
        avg: latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : -1,
        min: latencies.length > 0 ? Math.min(...latencies) : -1,
        max: latencies.length > 0 ? Math.max(...latencies) : -1,
        failures: results.length - successful.length,
        total: results.length
    };
}

/**
 * Get color for latency value
 */
export function getLatencyColor(latency: number): 'green' | 'yellow' | 'red' {
    if (latency < 100) return 'green';
    if (latency < 300) return 'yellow';
    return 'red';
}
