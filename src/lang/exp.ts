/**
 *  p ::= x | _ | {l: p, ..., l: p}
 *
 *  e ::= <number> | <char> | x | o
 *        p => e | e e | [e, ..., e]
 *        {l: e, ..., l: e} |
 *        <l: e, ..., l: e> | #l
 *
 * Sugar
 *  (e1, ..., ek) == {1: e1, ..., k: ek}
 *  {l1: p1, ... x, ... lk: pk} == {l1: p1, ... x: x, ... lk: pk}
 *  e1.l == e1 ({l} => x)     (precedence e1 e2.l == e1 (e2.l))
 *  e1[e2] == (e1, e2) index
 *  "abcde" == ['a', 'b', 'c', 'd', 'e']
 * let p = e1; e2 == e1 (p => e2)
 * e1; e2 == e1 (_ => e2) .. (precedence: p => e1; e2 == (p => e1); e2)
 *
 * x = e1; y = e2; e3 == e1 (x => e2 (y => e3))
 */

import { ops, parse } from './parser.js';
import { Type, toStringType } from './type.js';
import { Record, recordMapUsingGetters, recordToList2, toStringBrackets } from "./util.js";

export type Pattern = Pvar | Pwild | Prec;
export type Pvar = ['Pvar', string];
export type Pwild = ['Pwild'];
export type Prec = ['Prec', Record<Pattern>];

export type Exp = Enum | Echar | Evar | Eop | Elam
    | Eapp | Elist | Erec | Evariant | Etag | Eimport
    | Etype | Elet;

export type Enum = ['Enum', number];
export type Echar = ['Echar', string];
export type Evar = ['Evar', string];
export type Eop = ['Eop', string];
export type Elam = ['Elam', Pattern, Exp];
export type Eapp = ['Eapp', Exp, Exp];
export type Elist = ['Elist', Exp[]];
export type Erec = ['Erec', Record<Exp>];
export type Evariant = ['Evariant', Record<Exp>];
export type Etag = ['Etag', string];
export type Eimport = ['Eimport', string];
export type Etype = ['Etype', Type, Exp];
export type Elet = ['Elet', Pattern, Exp, Exp];

export type Tagged<A> = [string, A];

export function toStringPattern(p:Pattern): string {
    switch(p[0]){
        case 'Pwild': return '_';
        case 'Pvar': return p[1];
        case 'Prec': return '{' + recordToList2(p[1]).map(([l, p]) => l + ': ' + toStringPattern(p)).join(', ') + '}';
    }
}

export function toStringExp(e: Exp, prec = 0): string {
    switch(e[0]) {
        case 'Enum':
        case 'Evar':
        case 'Echar':
            return String(e[1]);
        case 'Eop':
            return e[1];
        case 'Elam':
            return toStringBrackets(toStringPattern(e[1]) + ' ⇒ ' + toStringExp(e[2]), true);
        case 'Eapp':
            return toStringBrackets(toStringExp(e[1]) + ' ' + toStringExp(e[2], 1), prec > 0);
        case 'Elist':
            return '[' + e[1].map(e0 => toStringExp(e0)).join(', ') + ']'
        case 'Erec':
            return '{' + recordToList2(e[1]).map(([l, e]) => l + ': ' + toStringExp(e)).join(', ') + '}';
        case 'Evariant':
            return '⟨' + recordToList2(e[1]).map(([l, e]) => l + ': ' + toStringExp(e)).join(', ') + '⟩';
        case 'Etag':
            return '#' + e[1];
        case 'Eimport':
            return 'import ' + e[1];
        case 'Etype':
            return toStringBrackets(toStringType(e[1]) + ' : ' + toStringExp(e[2]), true);
        case 'Elet':
            return "let " + toStringPattern(e[1]) + ' = ' + toStringExp(e[2]) + ';\n' + toStringExp(e[3]);
    }
}

export const importModule: { importModule: (name: string) => any} = {
    importModule: () => {throw 'Imports not allowed'}
};

export function evalExp(ctx: Record<any>, e: Exp): any {
    switch(e[0]) {
        case 'Enum':
        case 'Echar':
            return e[1];
        case 'Evar':
            return ctx[e[1]];
        case 'Eop':
            return eval(ops[e[1]][0]);
        case 'Elam':
            return (v: any) => {
                return evalExp(bindPattern(ctx, e[1], v), e[2])
            };
        case 'Eapp':
            const v = evalExp(ctx, e[1]);
            const f = evalExp(ctx, e[2]);
            return f(v);
        case 'Elist':
            return e[1].map(e0 => evalExp(ctx, e0));
        case 'Erec':
            return recordMapUsingGetters(e[1], (e0, _, v) => {
                return evalExp({...ctx, ...{this: v}}, e0);
            });
        case 'Evariant':
            const ret = (v: Tagged<any>) => {
                const f = evalExp(ctx, e[1][v[0]])
                return f(v[1]);
            }
            return ret;
        case 'Etag':
            return (e0: any) => [e[1], e0] as Tagged<any>
        case 'Eimport':
            return importModule.importModule(e[1]);
        case 'Etype':
            return evalExp(ctx, e[2]);
        case 'Elet':
            const v0 = evalExp(ctx, e[2]);
            const ctx0 = bindPattern(ctx, e[1], v0);
            return evalExp(ctx0, e[3]);
        default:
            throw 'Unknown exp: ' + e;
    }
}

function bindPattern(ctx: Record<any>, p: Pattern, v:any): Record<any> {
    switch(p[0]) {
        case 'Pvar':
            const result = {...ctx};
            result[p[1]] = v
            return result;
        case 'Pwild':
            return ctx;
        case 'Prec':
            return Object.keys(p[1]).reduce((result, key) => {
                return bindPattern(result, p[1][key], v[key]);
            }, ctx);
        default:
            throw 'Unknown pattern' + p;
    }
}

export function repl(x: string): string {
    const e = parse()(x);
    if(e == null)
        return '';
    if(e.length === 1){
        if(e[0][1] === '') {
            return JSON.stringify(evalExp({}, e[0][0]), undefined, 2);
        }
        return 'Parse error at: "' + e[0][1] + '"';
    }
    if(e.length === 0)
        return 'Parse error';
    return 'Ambiguous parse!';
}
