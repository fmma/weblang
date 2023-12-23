export type Record<A> = {[l: string]: A}

export function listToRecord<A>(xs: [string, A][]): Record<A> {
    const result: Record<A> = {};
    xs.forEach(x => result[x[0]] = x[1]);
    return result;
}

export function recordToList<A>(rec: Record<A>): A[] {
    return Object.keys(rec).sort().map(key => rec[key]);
}

export function recordToList2<A>(rec: Record<A>): [string, A][] {
    return Object.keys(rec).sort().map(key => [key, rec[key]]);
}

export function recordMap<A, B>(object: Record<A>, mapFn: (x: A, key: string, result: Record<B>) => B): Record<B> {
    return Object.keys(object).reduce<Record<B>>((result, key) => {
      result[key] = mapFn(object[key], key, result)
      return result
    }, {})
}

export function recordMapUsingGetters<A, B>(object: Record<A>, mapFn: (x: A, key: string, result: Record<B>) => B): Record<B> {
    return Object.keys(object).reduce<Record<B>>((result, key) => {
        Object.defineProperty(result, key, {
            get: () => {
                const x = mapFn(object[key], key, result);
                Object.defineProperty(result, key, {value: x});
                return x;
            },
            enumerable: true,
            configurable: true
        });
        return result
    }, {})
}

export function recordDifferenceWith<A, B>(f: (t1: A) => B, ts1: Record<A>, ts2: Record<A>): Record<B> {
    const ks1 = Object.keys(ts1);
    const ks2 = Object.keys(ts2);
    const ks = [...new Set(ks1)].filter(x => !(new Set(ks2).has(x)));
    return ks.reduce<Record<B>>((acc, k) => {
        acc[k] = f(ts1[k]);
        return acc;
    }, {});

}

export function recordIntersectWith<A, B>(f: (t1: A, t2: A) => B, ts1: Record<A>, ts2: Record<A>): Record<B> {
    const ks1 = Object.keys(ts1);
    const ks2 = Object.keys(ts2);
    const ks = [...new Set(ks1)].filter(x => new Set(ks2).has(x));
    return ks.reduce<Record<B>>((acc, k) => {
        acc[k] = f(ts1[k], ts2[k]);
        return acc;
    }, {});
}

export function recordUnionWith<A>(f: (t1: A, t2: A) => A, ts1: Record<A>, ts2: Record<A>): Record<A> {
    const ks1 = Object.keys(ts1);
    const ks2 = Object.keys(ts2);
    const ks = [...new Set([...ks1, ...ks2])];
    return ks.reduce<Record<A>>((acc, k) => {
        if(ts1[k]) {
            if(ts2[k])
                acc[k] = f(ts1[k], ts2[k]);
            else
                acc[k] = ts1[k];
        }
        else
            acc[k] = ts2[k];
        return acc;
    }, {});
}

export function toStringBrackets(x: string, putBrackets: boolean): string {
    return putBrackets ? '(' + x + ')' : x;
}
