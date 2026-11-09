/**
 * Horloge Logique Hybride (HLC) déterministe pour la résolution de conflits Last-Write-Wins (LWW)
 * Format : {ISO8601_UTC_Timestamp}-{Counter_Hex_4_Digits}-{NodeId}
 * Exemple : 2026-11-09T21:14:05.120Z-0001-a8f39c
 */
export class HybridLogicalClock {
  private lastWallTimeMs = 0;
  private counter = 0;

  constructor(private readonly nodeId: string) {}

  /** Génère un nouveau timestamp HLC strictement croissant pour une écriture locale */
  public now(physicalTimeMs = Date.now()): string {
    if (physicalTimeMs > this.lastWallTimeMs) {
      this.lastWallTimeMs = physicalTimeMs;
      this.counter = 0;
    } else {
      this.counter += 1;
    }
    return this.pack(this.lastWallTimeMs, this.counter, this.nodeId);
  }

  /** Met à jour l'horloge locale à la réception d'un événement distant */
  public receive(remoteHlc: string, physicalTimeMs = Date.now()): string {
    const parsed = this.unpack(remoteHlc);
    if (
      physicalTimeMs > this.lastWallTimeMs &&
      physicalTimeMs > parsed.wallTimeMs
    ) {
      this.lastWallTimeMs = physicalTimeMs;
      this.counter = 0;
    } else if (parsed.wallTimeMs > this.lastWallTimeMs) {
      this.lastWallTimeMs = parsed.wallTimeMs;
      this.counter = parsed.counter + 1;
    } else if (this.lastWallTimeMs > parsed.wallTimeMs) {
      this.counter += 1;
    } else {
      this.counter = Math.max(this.counter, parsed.counter) + 1;
    }
    return this.pack(this.lastWallTimeMs, this.counter, this.nodeId);
  }

  /** Compare deux HLC (> 0 si a est plus récent que b) */
  public static compare(hlcA: string, hlcB: string): number {
    if (hlcA === hlcB) return 0;
    return hlcA > hlcB ? 1 : -1;
  }

  private pack(wallTimeMs: number, counter: number, nodeId: string): string {
    const iso = new Date(wallTimeMs).toISOString();
    const hexCounter = counter.toString(16).padStart(4, '0');
    return `${iso}-${hexCounter}-${nodeId}`;
  }

  private unpack(hlc: string): {
    wallTimeMs: number;
    counter: number;
    nodeId: string;
  } {
    // Format ISO : YYYY-MM-DDTHH:mm:ss.sssZ (24 chars)
    const isoPart = hlc.slice(0, 24);
    const rest = hlc.slice(25).split('-');
    const counterHex = rest[0] ?? '0000';
    const nodeId = rest.slice(1).join('-') || 'unknown';
    return {
      wallTimeMs: Date.parse(isoPart),
      counter: parseInt(counterHex, 16) || 0,
      nodeId,
    };
  }
}
