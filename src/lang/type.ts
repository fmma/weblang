import { Exp, Pattern } from "./exp.js";
import { ops, parse, parseType } from "./parser.js";
import { Record, recordDifferenceWith, recordIntersectWith, recordMap, recordToList2, toStringBrackets } from "./util.js";

export type Type
    = Tnum | Tchar | Tunit | Tempty | Tfun | Tlist
    | Trec | Tvariant | Tvar | Tmu | Tforall;

export type Tnum = ['Tnum'];
export type Tchar = ['Tchar'];
export type Tunit = ['Tunit'];
export type Tempty = ['Tempty'];
export type Tfun = ['Tfun', Type, Type];
export type Tlist = ['Tlist', Type];
export type Trec = ['Trec', Record<Type>, Type];
export type Tvariant = ['Tvariant', Record<Type>, Type];
export type Tvar = ['Tvar', number];
export type Tmu = ['Tmu', number, Type];
export type Tforall = ['Tforall', number, Type];

const optypes: {[x: string]: Type} = {};
{
    const p = parseType();
    Object.keys(ops).forEach(k => {
        const string = ops[k][1];
        const r = p(string);
        if(r.length === 1) {
            optypes[k] = r[0][0];
            console.log(k + ':' + toStringType(r[0][0]));
        }
        else {
            console.log("WARNING: Could not parse optype for " + k + " : " + string);
        }
    });
}

let fresh = 0;
export let log: string[] = [];

let equations: Map<string, [number, Type]> = new Map();

export function solveFull() {
    let eqs = equations;
    for(let i = 0; i < 10000; ++i) {
        solveEquations();
        if(eqs.size === 0 || eqs !== equations)
            return;
    }
    throw 'Maximum iterations exceeded';
}

export function solveEquations() {
    tvarMap.clear();
    tVisited.clear();

    const eqs = new Map(equations);
    equations.clear();
    try {
        for(const [_, [a, t]] of eqs) {
            if(t[0] === 'Tvar' && t[1] === a)
                continue;
            if(tvarMap.size === 0) {
                tvars.clear();
                typeVars(t);
                if(tvars.has(a)) {
                    // mu intro
                    const b = freshVar();
                    tvarMap.set(a, b);
                    const t0 = substitute(t);
                    tvarMap.clear();
                    tvarMap.set(a, ['Tmu', b[1], t0]);
                }
                    // throw 'Occurrence check failed: ' + a + ' in ' + toStringType(t);
                else
                    tvarMap.set(a, t);
                continue
            }
            const t0 = substitute(['Tvar', a]);
            const t1 = substitute(t);
            eqtype(t0, t1);
        }
        if(lastType)
            lastType = flattenType(substitute(lastType));
    } catch(e) {
        equations = eqs;
        throw e;
    }
}

function typeVars(t: Type) {
    switch(t[0]) {
        case 'Tvar':
            tvars.add(t[1]);
            return;
        case 'Tfun':
            typeVars(t[1]);
            typeVars(t[2]);
            return;
        case 'Tlist':
            typeVars(t[1]);
            return;
        case 'Trec':
        case 'Tvariant':
            recordMap(t[1], typeVars);
            typeVars(t[2]);
            return;
        case 'Tmu':
            if(tvars.has(t[1]))
                typeVars(t[2]);
            else {
                typeVars(t[2]);
                tvars.delete(t[1]);
            }
            return;
        case 'Tforall':
            if(tvars.has(t[1]))
                typeVars(t[2]);
            else {
                typeVars(t[2]);
                tvars.delete(t[1]);
            }
            return;
    }
}

function flattenRecord(rec: Trec): Trec {
    if(rec[2][0] === 'Trec') {
        return flattenRecord(['Trec', recordMap({...rec[1], ...rec[2][1]}, t => flattenType(t)), flattenType(rec[2][2])]);
    }
    return rec;
}

function flattenVariant(rec: Tvariant): Tvariant {
    if(rec[2][0] === 'Tvariant') {
        return flattenVariant(['Tvariant', recordMap({...rec[1], ...rec[2][1]}, t => flattenType(t)), flattenType(rec[2][2])]);
    }
    return rec;
}

function flattenType(t: Type): Type {
    if(t[0] === 'Trec')
        return flattenRecord(t);
    if(t[0] === 'Tvariant')
        return flattenVariant(t);
    switch(t[0]) {
        case 'Tlist':
            return ['Tlist', flattenType(t[1])];
        case 'Tfun':
            return ['Tfun', flattenType(t[1]), flattenType(t[2])];
        case'Tmu':
            return ['Tmu', t[1], flattenType(t[2])];
        case 'Tforall':
            return ['Tforall', t[1], flattenType(t[2])];
    }
    return t;
}

function eqrowtype(ts0: Record<Type>, t0: Type, ts1: Record<Type>, t1: Type, cstr: (ts: Record<Type>, t: Type) => Type) {
    recordIntersectWith(eqtype, ts0, ts1);
    const a = t0;
    const b = t1;
    const diff0 = recordDifferenceWith(x => x, ts0, ts1);
    const diff1 = recordDifferenceWith(x => x, ts1, ts0);
    const empty0 = Object.keys(diff0).length === 0;
    const empty1 = Object.keys(diff1).length === 0;
    if(empty0 && empty1) {
        eqtype(a, b);
    }
    else if(!empty0 && empty1) {
        eqtype(b, cstr(diff0, a));
    }
    else if(empty0 && !empty1) {
        eqtype(a, cstr(diff1, b));
    }
    else {
        const c:Type = freshVar();
        eqtype(b, cstr(diff0, c));
        eqtype(a, cstr(diff1, c));
    }
}

function eqtype(t0: Type, t1: Type): void {
    const k = toStringType(t0) + ' = ' + toStringType(t1);
    console.log(k);
    if(tVisited.has(k)) {
        console.log(k);
        return;
    }
    tVisited.add(k);
    t0 = flattenType(t0);
    t1 = flattenType(t1);
    if(t0[0] === 'Tvar' || t1[0] === 'Tvar') {
        let a: number;
        let t: Type;
        if(t0[0] !== 'Tvar') {
            a = (t1 as Tvar)[1];
            t = t0;
        }
        else {
            a = t0[1];
            t = t1;
        }
        equations.set(a + ' = ' + toStringType(t), [a, t]);
        return;
    }
    let maxIter = 100;
    while((t0[0] === 'Tmu') && --maxIter > 0) {
        tvarMap.clear();
        if(t0[0] === 'Tmu') {
            //mu elim
            tvarMap.set(t0[1], t0);
            t0 = substitute(t0[2]);
        }
        else {
            // forall elim
            tvarMap.set(t0[1], freshVar());
            t0 = substitute(t0[2]);
        }
    }
    while((t1[0] === 'Tmu') && --maxIter > 0) {
        tvarMap.clear();
        if(t1[0] === 'Tmu') {
            //mu elim
            tvarMap.set(t1[1], t1);
            t1 = substitute(t1[2]);
        }
        else {
            // forall elim
            tvarMap.set(t1[1], freshVar());
            t1 = substitute(t1[2]);
        }
    }
    if(maxIter <= 0)
        throw 'Max iterations exceeded!';
    switch(t0[0]) {
        case 'Tchar':
        case 'Tnum':
        case 'Tunit':
        case 'Tempty':
            if(t1[0] === t0[0])
                return;
            break;
        case 'Tlist':
            if(t1[0] === 'Tlist')
                return eqtype(t0[1], t1[1]);
            break;
        case 'Tfun':
            if(t1[0] === 'Tfun') {
                eqtype(t0[1], t1[1]);
                eqtype(t0[2], t1[2]);
                return;
            }
            break;
        case 'Trec':
            if(t1[0] === 'Trec') {
                eqrowtype(t0[1], t0[2], t1[1], t1[2], (ts, t) => ['Trec', ts, t]);
                return;
            }
            break;
        case 'Tvariant':
            if(t1[0] === 'Tvariant') {
                eqrowtype(t0[1], t0[2], t1[1], t1[2], (ts, t) => ['Tvariant', ts, t]);
                return;
            }
            break;
    }
    throw 'Type error: ' + toStringType(t0) + ' == ' + toStringType(t1);
}

function typePattern(ctx: Record<Type>, p: Pattern): [Record<Type>, Type] {
    switch(p[0]) {
        case 'Pvar':
            const result = {...ctx};
            const t = freshVar();
            result[p[1]] = t;
            return [result, t];
        case 'Pwild':
            return [ctx, freshVar()];
        case 'Prec':
            const [ctx0, lts] = Object.keys(p[1]).reduce<[Record<Type>, Record<Type>]>(([ctx0, t], key) => {
                const [ctx1, t0] = typePattern(ctx0, p[1][key]);
                t[key] = t0;
                return [ctx1, t];
            }, [ctx, {}]);
            return [ctx0, ['Trec', lts, freshVar()]];
        default:
            throw 'Unknown pattern' + p;
    }
}

function typePatternBind(ctx: Record<Type>, p: Pattern, t: Type): Record<Type> {
    switch(p[0]) {
        case 'Pvar':
            const result = {...ctx};
            result[p[1]] = t;
            return result;
        case 'Pwild':
            return ctx;
        case 'Prec':
            throw 'Not supported: Record pattern in let-binding';
        default:
            throw 'Unknown pattern: ' + p;
    }
}


export function typeExp(ctx: Record<Type>, e: Exp): Type {
    switch(e[0]) {
        case 'Enum': return ['Tnum'];
        case 'Echar': return ['Tchar'];
        case 'Evar': {
            let t = ctx[e[1]];
            if(t == null)
                throw 'Type error: Unbound variable ' + e[1];
            tvarMap.clear();
            while(t[0] === 'Tforall') {
                tvarMap.set(t[1], freshVar());
                t = substitute(t[2]);
            }
            return t;
        }
        case 'Eop': {
            let t = optypes[e[1]];
            tvarMap.clear();
            while(t[0] === 'Tforall') {
                tvarMap.set(t[1], freshVar());
                t = substitute(t[2]);
            }
            return t;
        }
        case 'Elam': {
            const [ctx0, t0] = typePattern(ctx, e[1]);
            const t1 = typeExp(ctx0, e[2]);
            return ['Tfun', t0, t1];
        }
        case 'Eapp': {
            const t0 = typeExp(ctx, e[1]);
            const t1 = typeExp(ctx, e[2]);
            const t2: Type = freshVar();
            eqtype(t1, ['Tfun', t0, t2]);
            return t2;
        }
        case 'Elist': {
            const ts = e[1].map((e0 : Exp) => typeExp(ctx, e0));
            const t: Type = freshVar();
            ts.forEach(t0 => eqtype(t0, t));
            return ['Tlist', t];
        }
        case 'Erec': {
            const a: Type = freshVar();
            const t0: Type = ['Trec', recordMap(e[1], e0 => {
                    const t0 = typeExp({this: a, ...ctx}, e0);
                    return t0;
                }), ['Tunit']];
            eqtype(a, t0);
            return t0;
        }
        case 'Evariant': {
            const ts = recordMap(e[1], e0 => typeExp(ctx, e0));
            const t: Type = freshVar();

            const ts0 = recordMap<Type, Type>(ts, t0 => {
                const t1: Type = freshVar();
                eqtype(t0, ['Tfun', t1, t]);
                return t1;
            });
            return ['Tfun', ['Tvariant', ts0, ['Tempty']], t];
        }
        case 'Etag': {
            const ts: Record<Type> = {};
            const t: Type = freshVar()
            ts[e[1]] = t;
            return ['Tfun', t, ['Tvariant', ts, freshVar()]]
        }
        case 'Eimport': {
            return freshVar();
        }
        case 'Etype': {
            const t0 = e[1];
            let t = t0;
            tvarMap.clear();
            while(t[0] === 'Tforall') {
                tvarMap.set(t[1], freshVar());
                t = substitute(t[2]);
            }
            const t1 = typeExp(ctx, e[2]);
            eqtype(t, t1);
            return t0;
        }
        case 'Elet': {
            const t0 = typeExp(ctx, e[2]);
            const ctx0 = typePatternBind(ctx, e[1], t0);
            return typeExp(ctx0, e[3]);
        }
    }
}

export function toStringType(t:Type, prec = 0): string {
    switch(t[0]) {
        case 'Tnum': return 'N';
        case 'Tchar': return 'C';
        case 'Tunit': return '{}';
        case 'Tempty': return '⟨⟩';
        case 'Tfun' : return toStringBrackets(toStringType(t[1], 1) + ' → ' + toStringType(t[2]), prec > 0);
        case 'Tlist': return '[' + toStringType(t[1]) + ']';
        case 'Trec':
            return '{' + recordToList2(t[1]).map(([l, t]) => l + ': ' + toStringType(t)).join(', ') + (t[2][0] === 'Tunit' ? '' : '|' + toStringType(t[2])) +'}';
        case 'Tvariant': return '⟨' + recordToList2(t[1]).map(([l, t]) => l + ': ' + toStringType(t)).join(', ') + (t[2][0] === 'Tempty' ? '' : '|' + toStringType(t[2])) + '⟩';
        case 'Tvar': return String(t[1]);
        case 'Tmu': return toStringBrackets("mu " + String(t[1]) + ". " + toStringType(t[2]), true);
        case 'Tforall': return toStringBrackets("forall " + String(t[1]) + ". " + toStringType(t[2]), true);
    }
}

let tvars: Set<number> = new Set();
let tVisited: Set<string> = new Set();

let tvarMap: Map<number, Type> = new Map();

export function substitute(t: Type): Type {
    switch(t[0]) {
        case 'Tchar':
        case 'Tnum':
        case 'Tempty':
        case 'Tunit':
            return t;
        case 'Tvar':
            return tvarMap.get(t[1]) ?? t;
        case 'Tfun':
            return ['Tfun', substitute(t[1]), substitute(t[2])];
        case 'Tlist':
            return ['Tlist', substitute(t[1])];
        case 'Trec':
            return ['Trec', recordMap<Type, Type>(t[1], substitute), substitute(t[2])];
        case 'Tvariant':
            return ['Tvariant', recordMap<Type, Type>(t[1], substitute), substitute(t[2])];
        case 'Tmu':{
                const t0 = tvarMap.get(t[1]);
                tvarMap.delete(t[1]);
                const t1: Type = ['Tmu', t[1], substitute(t[2])];
                if(t0)
                    tvarMap.set(t[1], t0);
                return t1;
            }
        case 'Tforall': {
                const t0 = tvarMap.get(t[1]);
                tvarMap.delete(t[1]);
                const t1: Type = ['Tforall', t[1], substitute(t[2])];
                if(t0)
                    tvarMap.set(t[1], t0);
                return t1;
            }
    }
}

export function setLog() {
    log = [];
    log.push("TYPE EQUALITIES:");
    for(let [k, _] of equations) {
        log.push(k);
    }
}

export let lastType: Type | undefined;

export function replTypeOf(x: string, clear: boolean = true): string {
    if(clear) {
        fresh = 2;
        equations.clear();
        tvarMap.clear();
        tVisited.clear();
    }
    const e = parse()(x);
    if(e == null)
        return '';
    if(e.length === 1){
        if(e[0][1] === '') {
            lastType = substitute(typeExp({}, e[0][0]));
            setLog();
            return toStringType(lastType);
        }
        return 'Parse error at: "' + e[0][1] + '"';
    }
    if(e.length === 0)
        return 'Parse error';
    return 'Ambiguous parse!';
}

function freshVar(): Tvar {
    return ['Tvar', fresh++];
}
