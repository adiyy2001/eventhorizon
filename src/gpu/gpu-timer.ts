const slotCount = 3;
const timestampBytes = 8;
const queryCount = 2;
const nanosecondsPerMillisecond = 1e6;

interface Slot {
  staging: GPUBuffer;
  busy: boolean;
  tag: number;
}

export interface GpuMeasurement {
  milliseconds: number;
  tag: number;
}

export class GpuTimer {
  private readonly querySet: GPUQuerySet;
  private readonly resolveBuffer: GPUBuffer;
  private readonly slots: Slot[];
  private pending: Slot | null = null;
  private latest: GpuMeasurement | null = null;

  constructor(private readonly device: GPUDevice) {
    this.querySet = device.createQuerySet({ type: 'timestamp', count: queryCount });
    this.resolveBuffer = device.createBuffer({
      label: 'timestamp resolve',
      size: queryCount * timestampBytes,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    });
    this.slots = Array.from({ length: slotCount }, () => ({
      staging: device.createBuffer({
        label: 'timestamp staging',
        size: queryCount * timestampBytes,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      }),
      busy: false,
      tag: 1,
    }));
  }

  get lastMeasurement(): GpuMeasurement | null {
    return this.latest;
  }

  begin(
    tag: number,
  ): { first: GPUComputePassTimestampWrites; last: GPURenderPassTimestampWrites } | null {
    const free = this.slots.find((slot) => !slot.busy);
    if (free === undefined) {
      return null;
    }
    free.tag = tag;
    this.pending = free;
    return {
      first: { querySet: this.querySet, beginningOfPassWriteIndex: 0 },
      last: { querySet: this.querySet, endOfPassWriteIndex: 1 },
    };
  }

  finish(encoder: GPUCommandEncoder): void {
    const slot = this.pending;
    if (slot === null) {
      return;
    }
    this.pending = null;
    slot.busy = true;
    encoder.resolveQuerySet(this.querySet, 0, queryCount, this.resolveBuffer, 0);
    encoder.copyBufferToBuffer(this.resolveBuffer, 0, slot.staging, 0, queryCount * timestampBytes);
    void this.device.queue.onSubmittedWorkDone().then(
      () => {
        this.collect(slot);
      },
      () => {
        slot.busy = false;
      },
    );
  }

  private collect(slot: Slot): void {
    void slot.staging.mapAsync(GPUMapMode.READ).then(
      () => {
        const [start = 0n, end = 0n] = new BigUint64Array(slot.staging.getMappedRange().slice(0));
        slot.staging.unmap();
        slot.busy = false;
        if (end > start) {
          this.latest = {
            milliseconds: Number(end - start) / nanosecondsPerMillisecond,
            tag: slot.tag,
          };
        }
      },
      () => {
        slot.busy = false;
      },
    );
  }

  destroy(): void {
    this.querySet.destroy();
    this.resolveBuffer.destroy();
    for (const slot of this.slots) {
      slot.staging.destroy();
    }
  }
}
