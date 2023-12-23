import { Pattern, Exp } from "./exp.js";
import { Record, listToRecord } from "./util.js";
import { Type } from "./type.js";

export function parse(): Parser<Exp> {
    return pbind(parseExp(),
        x => pbind(sat(/^\s*/m),
        _ => ppure(x)));
}

export function parse2(x: string): Exp {
    const e = parse()(x);
    if(e == null)
        throw 'Null exception';
    if(e.length === 1){
        if(e[0][1] === '') {
            return e[0][0];
        }
        throw 'Parse error at: "' + e[0][1] + '"';
    }
    if(e.length === 0)
        throw 'Parse error';
    throw 'Ambiguous parse!';
}

export const ops: {[x: string]: [string,string]} = {
    '+': ['x => x[0] + x[1]', '(N, N) -> N'],
    '#': ['x => x.length', 'forall a. [a] -> N'],
    '&': ['x => Array.from({length: x}, (_,i) => i)', 'N -> [N]'],
    'map': ['f => x => x.map(f)', 'forall a. forall b. (a -> b) -> [a] -> [b]']
}

const parseTag: Parser<string> = token(/^#[a-zA-Z][a-zA-Z]*/);
const parseIdent: Parser<string> = token(/^[a-zA-Z][a-zA-Z]*/);
const parseTypeVar: Parser<number> = pmap(x => x.charCodeAt(0) - 'a'.charCodeAt(0), token(/^[a-z]/));

function parseProjections(): Parser<string[]> {
    return many(pbind(token(/^\./), _ => biasedChoice(parseIdent, token(/^[0-9]*/))));
}

const parseOp: Parser<string> = biasedChoice(
    ...Object.keys(ops).reduce<Parser<string>[]>((result, op) => {
        return [...result, pmap(_ => op, token(new RegExp("^" + escapeRegExp(op))))]
    }, [])
);
const parseNumber: Parser<number> = pmap(x => +x, token(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/));
const parseChar: Parser<string> = token(/^'.'/);

function parsePattern(): Parser<Pattern> {
    return biasedChoice<Pattern>(
        pmap(_ => ['Pwild'], token(/^_/)),
        pmap(x => ['Pvar', x], parseIdent),
        pmap(ps => ['Prec', ps], parseRecord<Pattern>(/^{/, /^}/, plazy(parsePattern))),
        pmap(ps => ['Prec', listToRecord(ps.map((p, i) => [String(i), p]))], parseBrackeets<Pattern[]>(/^\(/, /^\)/, sepBy<Pattern>(token(/^,/), plazy(parsePattern)))),
    )
}

function parseAtomicExp(): Parser<Exp> {
    return pbind(biasedChoice<Exp>(
        parseBrackeets(/^\(/, /^\)/, plazy(parseExp)),
        pmap(x => ['Eimport', x], parseImport()),
        pmap(o => ['Eop', o], parseOp),
        pmap(n => ['Enum', n], parseNumber),
        pmap(c => ['Echar', c], parseChar),
        pmap(x => ['Evar', x], parseIdent),
        pmap(x => ['Elist', [...JSON.parse(x)].map(c => ['Echar', c] as Exp)], token(/^"(?:[^"\\]|\\.)*"/)),
        pmap(es => ['Elist', es], parseBrackeets<Exp[]>(/^\[/, /^\]/, sepBy<Exp>(token(/^,/), plazy(parseExp)))),
        pmap(es => ['Erec', listToRecord(es.map((e, i) => [String(i), e]))], parseBrackeets<Exp[]>(/^\(/, /^\)/, sepBy<Exp>(token(/^,/), plazy(parseExp)))),
        pmap(les => ['Erec', les], parseRecord<Exp>(/^{/, /^}/, plazy(parseExp))),
        pmap(les => ['Evariant', les], parseRecord<Exp>(/^</, /^>/, plazy(parseExp))),
        pmap(x => ['Etag', x.replace('#', '')], parseTag)
        ), e =>
            pbind(parseProjections(), ls => {
                for(let l of ls) {
                    let pat: Record<Pattern> = {};
                    pat[l] = ['Pvar', l];
                    e = ['Eapp', e, ['Elam', ['Prec', pat], ['Evar', l]]];
                }
                return ppure(e);
            }));
    }

function parseImport(): Parser<string> {
    return pbind(token(/^import /), _ => parseIdent);
}

function parseLet_(): Parser<Exp> {
    return pbind(parseExpNoLet(),
        e1 => pbind(token(/^;/),
        _ => pbind(parseExp(),
        e2 => ppure(['Elet', ['Pwild'], e1, e2]))));
}

function parseLet(): Parser<Exp> {
    return pbind(token(/^let/),
        _ => pbind(parsePattern(),
        p => pbind(token(/^=/),
        _ => pbind(parseExpNoLet(),
        e1 => pbind(token(/^;/),
        _ => pbind(parseExp(),
        e2 => ppure(['Elet', p, e1, e2])))))));
}

function parseExpNoLet(): Parser<Exp> {
    return biasedChoice<Exp>(
        papp<Exp, Exp>(pmap(p => e => ['Elam', p, e], parsePattern()), pbind(token(/^=>/), _ => parseExpNoLet())),
        parseTypeAnnotation(),
        pmap((x: Exp[]) => x.reduce((result, e) => ['Eapp', result, e]), sepBy1(sat(/^\s*/m), parseAtomicExp()))
    )
}

function parseTypeAnnotation(): Parser<Exp> {
    return papp(papp(pmap(t => _ => e => ['Etype', t, e], parseType()), token(/^:/)), plazy<Exp>(parseExpNoLet));
}

function parseExp(): Parser<Exp> {
    return biasedChoice<Exp>(
        parseLet(),
        parseLet_(),
        parseTypeAnnotation(),
        papp<Exp, Exp>(pmap(p => e => ['Elam', p, e], parsePattern()), pbind(token(/^=>/), _ => parseExp())),
        pmap((x: Exp[]) => x.reduce((result, e) => ['Eapp', result, e]), sepBy1(sat(/^\s*/m), parseAtomicExp()))
    );
}

export function parseType(): Parser<Type> {
    return biasedChoice<Type>(
        papp(papp(papp(pmap(_ => x => _ => t => ['Tforall', x, t], token(/^forall/)), parseTypeVar), token(/^\./)), plazy<Type>(parseType)),
        papp(papp(papp(pmap(_ => x => _ => t => ['Tmu', x, t], token(/^mu/)), parseTypeVar), token(/^\./)), plazy<Type>(parseType)),
        parseFunType()
    )
}

export function parseFunType(): Parser<Type> {
    return biasedChoice<Type>(
        papp<Type, Type>(pmap(t0 => t1 => ['Tfun', t0, t1], parseAtomicType()), pbind(token(/^->/), _ => parseType())),
        parseAtomicType()
    )
}

function parseAtomicType(): Parser<Type> {
    return biasedChoice<Type>(
        parseBrackeets(/^\(/, /^\)/, plazy(parseType)),
        pmap(_ => ['Tnum'], token(/^N/)),
        pmap(_ => ['Tchar'], token(/^C/)),
        pmap(t0 => ['Tlist', t0], parseBrackeets<Type>(/^\[/, /^\]/, plazy(parseType))),
        pmap(ts => ['Trec', listToRecord(ts.map((t, i) => [String(i), t])), ['Tunit']], parseBrackeets<Type[]>(/^\(/, /^\)/, sepBy<Type>(token(/^,/), plazy(parseType)))),
        pmap(lts => ['Trec', lts, ['Tunit']], parseRecord<Type>(/^{/, /^}/, plazy(parseType))),
        pmap(lts => ['Tvariant', lts, ['Tempty']], parseRecord<Type>(/^</, /^>/, plazy(parseType))),
        pmap(x => ['Tvar', x], parseTypeVar)
    );
}

type Parser<A> = (input: string) => [A, string][];

function plazy<A>(p: () => Parser<A>): Parser<A> {
    return input => p()(input);
}

function pmap<A,B>(f: (x: A) => B, p: Parser<A>): Parser<B> {
    return input => p(input).map(x => [f(x[0]), x[1]]);
}

function ppure<A>(x: A): Parser<A> {
    return input => [[x, input]];
}

function papp<A, B>(pf: Parser<(x: A) => B>, px: Parser<A>): Parser<B> {
    return pbind(pf, f => pbind(px, x => ppure(f(x))));
}

function pzip<A, B>(p1: Parser<A>, p2: Parser<B>): Parser<[A, B]> {
    return papp(pmap(x => y => [x, y], p1), p2);
}

function pbind<A, B>(p: Parser<A>, f: (x: A) => Parser<B>): Parser<B> {
    return input => p(input).flatMap(x => f(x[0])(x[1]));
}

function pfail<A>(): Parser<A> {
    return input => [];
}

function choice<A>(...ps: Parser<A>[]): Parser<A> {
    return input => ps.flatMap(p => p(input));
}

function biasedChoice<A>(...ps: Parser<A>[]): Parser<A> {
    return input => {
        for(let i = 0; i < ps.length; ++i) {
            const r = ps[i](input);
            if(r.length > 0)
                return r;
        }
        return [];
    };
}

function many<A>(p: Parser<A>): Parser<A[]> {
    return biasedChoice(many1(p), ppure([]));
}

function many1<A>(p: Parser<A>): Parser<A[]> {
    return pbind(p, x => pbind(many(p), xs => ppure([x, ...xs])));
}

function sepBy<A>(sep: Parser<unknown>, p: Parser<A>): Parser<A[]> {
    return biasedChoice(sepBy1(sep, p), ppure([]));
}

function sepBy1<A>(sep: Parser<unknown>, p: Parser<A>): Parser<A[]> {
    return pbind(p,
        x => pbind(many(pbind(sep, _ => p)),
        xs => ppure([x, ...xs])));
}

function token(regex: RegExp): Parser<string> {
    return pbind(sat(/^\s*/m), _=>sat(regex));
}

function sat(regex: RegExp): Parser<string> {
    return input => {
        const result = regex.exec(input);
        if(result?.length) {
            return [[result[0], input.substring(result[0].length)]];
        }
        return [];
    }
}

function parseBrackeets<A>(ob: RegExp, cb: RegExp, p: Parser<A>): Parser<A> {
    return pbind(token(ob),
        _ => pbind(p,
        x => pbind(token(cb),
        _ => ppure(x))));
}

function parseRecord<A>(ob: RegExp, cb: RegExp, p: Parser<A>): Parser<Record<A>> {
    return parseBrackeets(ob, cb,
        pbind(sepBy(token(/^,/), pbind(parseIdent,
            l => pbind(token(/^:/),
            _ => pbind(p,
            x => ppure([l, x] as [string, A]))))),
        xs => ppure(listToRecord(xs))));
}

function escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
