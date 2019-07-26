/* eslint-disable prefer-rest-params */

import Dexie from 'dexie';

export interface Options {
  limit?: number;
  batchSize: number;
}

export type Callback<T> = (item: T, index: number) => void

export default class DexieBatch {
  private readonly opts: Options;

  constructor(opts: Options) {
    assertValidOptions(opts)
    this.opts = opts
  }

  isParallel(): boolean {
    return Boolean(this.opts.limit)
  }

  each<T>(collection: Dexie.Collection<T, any>, callback: Callback<T>): Dexie.Promise<number> {
    assertValidMethodArgs(...arguments)

    return this.eachBatch(collection, (batch, batchIdx) => {
      const baseIdx = batchIdx * this.opts.batchSize
      return Dexie.Promise.all(batch.map((item, i) => callback(item, baseIdx + i)))
    })
  }

  eachBatch<T>(collection: Dexie.Collection<T, any>, callback: Callback<T[]>): Dexie.Promise<number> {
    assertValidMethodArgs(...arguments)

    return this.isParallel() ? this.eachBatchParallel(collection, callback) : this.eachBatchSerial(collection, callback);
  }

  eachBatchParallel<T>(collection: Dexie.Collection<T, any>, callback: Callback<T[]>): Dexie.Promise<number> {
    assertValidMethodArgs(...arguments)
    if (!this.opts.limit) {
      throw new Error('Option "limit" must be set for parallel operation')
    }

    const { batchSize } = this.opts
    const batchPromises: Dexie.Promise<void>[] = []

    for (let batchIdx = 0; batchIdx * batchSize < this.opts.limit; batchIdx++) {
      const batchPromise = collection
        .clone()
        .offset(batchIdx * batchSize)
        .limit(batchSize)
        .toArray()
        .then(batch => callback(batch, batchIdx))
      batchPromises.push(batchPromise)
    }

    return Dexie.Promise.all(batchPromises).then(batches => batches.length)
  }

  eachBatchSerial<T>(collection: Dexie.Collection<T, any>, callback: Callback<T[]>, batchIdx = 0): Dexie.Promise<number> {
    assertValidMethodArgs(...arguments)

    const { batchSize } = this.opts
    return collection
      .clone()
      .limit(batchSize)
      .toArray()
      .then(batch => {
        if (batch.length === 0) return 0

        const userPromise = callback(batch, batchIdx)
        const nextBatchesPromise = this.eachBatchSerial(
          collection.clone().offset(batchSize),
          callback,
          batchIdx + 1
        )

        return Dexie.Promise.all([userPromise, nextBatchesPromise]).then(
          ([, batchCount]) => batchCount + 1
        )
      })
  }
}

function assertValidOptions(opts: Options): void {
  const batchSize = opts && opts.batchSize
  if (!(batchSize && Number.isInteger(batchSize) && batchSize > 0)) {
    throw new Error('Mandatory option "batchSize" must be a positive integer')
  }

  if ('limit' in opts && !(Number.isInteger(opts.limit!) && opts.limit! >= 0)) {
    throw new Error('Option "limit" must be a non-negative integer')
  }
}

function assertValidMethodArgs<T>(...args: any[]): void {
  if (arguments.length < 2) {
    throw new Error('Arguments "collection" and "callback" are mandatory')
  }

  if (!isCollectionInstance(args[0])) {
    throw new Error('"collection" must be of type Collection')
  }

  if (!(typeof args[1] === 'function')) {
    throw new TypeError('"callback" must be a function')
  }
}

// We would need the Dexie instance that created the collection to get the
// Collection constructor and do some proper type checking.
// So for now we resort to duck typing
function isCollectionInstance(obj: any) {
  if (!obj) return false
  return ['clone', 'offset', 'limit', 'toArray'].every(
    name => typeof obj[name] === 'function'
  )
}
