import type { BrokerAdapter } from './broker-adapter.interface.js';
import type { BrokerType } from '@tcp/shared-types';
import { BrokerType as BT } from '@tcp/shared-types';
import { SimulatedBrokerAdapter } from './simulated-broker.js';
import { createServiceLogger } from '@tcp/shared-utils';

const log = createServiceLogger('adapter-registry');

/**
 * Registry for broker adapters. Dynamically resolves the correct adapter for each broker type.
 */
export class AdapterRegistry {
    private adapters: Map<BrokerType, () => BrokerAdapter> = new Map();
    private instances: Map<string, BrokerAdapter> = new Map();

    constructor() {
        // Register default adapters
        this.register(BT.SIMULATED, () => new SimulatedBrokerAdapter());
        // Future: this.register(BT.MT5, () => new MT5BrokerAdapter());
        // Future: this.register(BT.CTRADER, () => new CTraderBrokerAdapter());
    }

    register(brokerType: BrokerType, factory: () => BrokerAdapter): void {
        this.adapters.set(brokerType, factory);
        log.info({ brokerType }, 'Adapter registered');
    }

    getOrCreate(brokerType: BrokerType, instanceKey: string): BrokerAdapter {
        const existing = this.instances.get(instanceKey);
        if (existing && existing.isConnected()) return existing;

        const factory = this.adapters.get(brokerType);
        if (!factory) throw new Error(`No adapter registered for broker type: ${brokerType}`);

        const adapter = factory();
        this.instances.set(instanceKey, adapter);
        return adapter;
    }

    async disconnectAll(): Promise<void> {
        for (const [key, adapter] of this.instances) {
            try {
                await adapter.disconnect();
            } catch (error) {
                log.error({ key, error }, 'Failed to disconnect adapter');
            }
        }
        this.instances.clear();
    }
}
