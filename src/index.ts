import './dom.js';
import { repl, toStringExp } from "./lang/exp.js";
import { parse } from "./lang/parser.js";
import { lastType, log, replTypeOf, setLog, solveEquations, solveFull, substitute, toStringType } from './lang/type.js';

export class IndexPage {

    constructor(readonly p: Node) {
        this.buttonsDiv._button('SOLVE STEP', () => this.solveClicked(solveEquations));
        this.buttonsDiv._button('SOLVE FULL', () => this.solveClicked(solveFull));
        this.textArea.cols = 120;
        this.textArea.rows = 25;
        this.explorerTreeView.collapsed = false;
        this.explorerTreeView.redraw();
        this.loadModule(window.localStorage.getItem('weblang:lastopen') ?? 'Untitled');
    }

    currentModuleName = 'Untitled';
    moduleNames: string[] = JSON.parse(window.localStorage.getItem('weblang:modules') ?? '["Untitled"]');

    flexBox = this.p._flexbox();
    explorerDiv = this.flexBox._div();
    editorDiv = this.flexBox._div();
    logDiv = this.p._div();

    explorerTreeView = this.explorerDiv._treeView(() => this.explorerTree());

    moduleNameDiv = this.editorDiv._div();
    inputCurrentModuleName = this.moduleNameDiv._input('Module name', 'text', this.currentModuleName);
    saveButton = this.moduleNameDiv._button('SAVE', () => this.saveModule());
    deleteButton = this.moduleNameDiv._button('DELETE', () => this.deleteModule());
    textArea = this.editorDiv._textArea('', () => this.onTextChanged());
    buttonsDiv = this.editorDiv._div();

    textParseResult = this.logDiv._div()._text('');
    textType = this.logDiv._div()._text('');
    text = this.logDiv._div()._text('');
    textExcept = this.logDiv._div()._text('');

    loadModule(n: string) {
        window.localStorage.setItem('weblang:lastopen', n);
        this.currentModuleName = n;
        this.inputCurrentModuleName.value = n;
        this.textArea.value = window.localStorage.getItem('weblang:src:' + n) ?? 'failed to load module ' + n;
        this.onTextChanged();
        this.solveClicked(solveFull);
    }

    saveModule() {
        const n = this.inputCurrentModuleName.value;
        window.localStorage.setItem('weblang:lastopen', n);
        if(!this.moduleNames.includes(n))
            this.moduleNames.push(n);
        window.localStorage.setItem('weblang:modules', JSON.stringify(this.moduleNames));
        window.localStorage.setItem('weblang:src:' + n, this.textArea.value);
        this.explorerTreeView.redraw();
    }

    deleteModule() {
        const n = this.inputCurrentModuleName.value;
        this.moduleNames.splice(this.moduleNames.indexOf(n), 1);
        window.localStorage.setItem('weblang:modules', JSON.stringify(this.moduleNames));
        this.explorerTreeView.redraw();
    }

    solveClicked(f: () => void) {
        try {
            f();
            setLog();
            this.logDiv._draw(() => {
                log.forEach(l => {
                    this.logDiv._div()._text(l);
                });
            });
            if(lastType)
                this.textType.textContent = 'Type: ' + toStringType(substitute(lastType));
        }
        catch(e) {
            this.textExcept.textContent = 'Exception: ' + e;
            throw e;
        }
    }

    onTextChanged() {
        window.localStorage.setItem('weblang:src:' + this.currentModuleName, this.textArea.value);
        this.textParseResult.textContent = '';
        this.text.textContent = '';
        this.textType.textContent = '';
        this.textExcept.textContent = '';
        if(this.textArea.value.trim().length === 0)
            return;
        try {
            this.textParseResult.textContent = 'Parse:' + toStringExp(parse()(this.textArea.value ?? '')[0][0]);
            this.textType.textContent = 'Type: ' + replTypeOf(this.textArea.value ?? '');
            this.logDiv._draw(() => {
                log.forEach(l => {
                    this.logDiv._div()._text(l);
                });
            });
            this.text.textContent = 'Result:' + repl(this.textArea.value ?? '');
        }
        catch(e) {
            this.textExcept.textContent = 'Exception: ' + e;
            throw e;
        }
    }

    explorerTree(): { ith(i: number, li: HTMLLIElement): void; n: number; title: string; } {
        return {
            ith: (i, li) => {
                const n = this.moduleNames[i];
                li._ul()._button(n, () => this.loadModule(n));
            },
            n: this.moduleNames.length,
            title: 'Modules'
        }
    }

}

new IndexPage(document.body);
