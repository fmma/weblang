declare global {
    interface Node {
        _class(className: string): this;

        _text(text: string): Text;
        _div(): HTMLDivElement;
        _span(): HTMLSpanElement;
        _ul(): HTMLUListElement;
        _li(): HTMLLIElement;
        _form(): HTMLFormElement;
        _svg(): SVGSVGElement;
        _table(... columns: string[]): HTMLTableElement;
        _td(): HTMLTableDataCellElement;
        _textArea(value: string, onchange?: (value: string) => void): HTMLTextAreaElement;
        _tr(): HTMLTableRowElement;
        _flexbox(): HTMLDivElement;
        _treeView(treeProvider: TreeProvider): TreeViewElement;
        _pagedTable(columns: string[], pageSize: number, rows: RowProvider): PagedTableElement;
        _link(name: string, href: string): HTMLAnchorElement;
        _button(text: string, action?: () => void): HTMLButtonElement;
        _input(placeholder: string, type: string, value: string, onchange?: (value: string) => void): HTMLInputElement;
        _inputDate(value: Date, onchange?: () => void): HTMLInputElement;
        _inputTime(value: Date, onchange?: () => void): HTMLInputElement;
        _inputWeight(placeholder: string, value: number, onchange?: (value: number) => void, oninput?: (value: number) => void): HTMLInputElement;
        _inputNumber(placeholder: string, value: number, onchange?: (value: number) => void): HTMLInputElement;
        _checkbox(value: boolean, onchange?: (isChecked : boolean) => void): HTMLInputElement;
        _paragraph(text: string): HTMLParagraphElement;
        _select(options: string[], i: number, onchange?: (i: number) => void): HTMLSelectElement;

        _draw(block: () => void): void;

        provideNode<T extends Node>(create: () => T): T;
        lastReuseId: number | undefined;
        reuseId: number | undefined;
        [index:number]: Node;
    }
}

export type TreeProvider = () => { ith(i: number, li: HTMLLIElement): void, n: number, title: string}

export interface TreeViewElement {
    redraw(): void;
    tree: TreeProvider;
    node: HTMLDivElement;
    collapsed: boolean;
}

export type RowProvider = () => { ith(i: number, row: HTMLTableRowElement): void, n: number};

export interface PagedTableElement {
    redraw(): void;
    rows: RowProvider;
    index: number;
    pageSize: number;
    node: HTMLDivElement;
}

Node.prototype._draw = function(block: () => void): void {
    this.lastReuseId = this.reuseId == null ? 0 : this.reuseId;
    this.reuseId = 1;
    block();
    for(let i = this.reuseId; i < this.lastReuseId; ++i) {
        this.removeChild(this[i]);
        delete this[i];
    }
}

Node.prototype.provideNode = function<T extends Node>(create: () => T): T {
    if(this.reuseId == null) {
        return this.appendChild(create());
    }
    let old: T = this[this.reuseId] as T;
    if(old == null) {
        old = create();
        this.appendChild(old);
        this[this.reuseId] = old;
    }
    old.reuseId = 1;
    this.reuseId++;
    return old;
}

Element.prototype._class = function(className: string) {
    this.className = className;
    return this;
}

Node.prototype._link = function(name: string, href: string) {
    const result = this.provideNode(() => document.createElement("a"));
    result.innerHTML = name;
    result.href = href + window.location.search;
    return result;
}

Node.prototype._div = function() {
    return this.provideNode(() => document.createElement("div"));
}

Node.prototype._span = function() {
    return this.provideNode(() => document.createElement("span"));
}

Node.prototype._ul = function() {
    return this.provideNode(() => document.createElement("ul"));
}

Node.prototype._li = function() {
    return this.provideNode(() => document.createElement("li"));
}

Node.prototype._form = function() {
    const form = this.provideNode(() => document.createElement("form"));
    return form;
}

Node.prototype._svg = function() {
    const svg = this.provideNode(() => document.createElementNS("http://www.w3.org/2000/svg", "svg"));
    return svg;
}

Node.prototype._table = function(... columns: string[]) {
    const table = this.provideNode(() => document.createElement("table"));
    const head = table.provideNode(() => document.createElement("thead"));
    for(let i = 0; i < columns.length; ++i) {
        const col = columns[i];
        const td = head.provideNode(() => document.createElement("td"));
        td.innerHTML = col;
    }
    this.appendChild(table);
    return table;
}

Node.prototype._td = function() {
    return this.provideNode(() => document.createElement("td"));
}

Node.prototype._textArea = function(value: string, onchange: (value: string) => void = () => {}) {
    const textArea = this.provideNode(() => document.createElement("textarea"));
    textArea.value = value;
    textArea.oninput = () => onchange(textArea.value);
    textArea.cols = 80;
    textArea.rows = 20;
    textArea.style.fontFamily = 'monospace';
    return textArea;
}

Node.prototype._tr = function() {
    return this.provideNode(() =>  document.createElement("tr"));
}

Node.prototype._flexbox = function() {
    const div = this.provideNode(() => document.createElement("div"));
    div.style.display = 'flex';
    return div;
}

Node.prototype._treeView = function(treeProvider: TreeProvider) {

    function redraw() {

        ul._draw(() => {
            const tree = treeView.tree();
            span.textContent = tree.title;
            if(treeView.collapsed) {
                span._class("caret");
                return;
            }
            span._class("caret-down");
            for(let i =  0; i < tree.n; ++i) {
                const li = ul._li();
                tree.ith(i, li);
            }
        });
    }

    const div = this._div();
    const span = div._span()
    span._class("caret");
    span.addEventListener("click", () => {
        treeView.collapsed = !treeView.collapsed;
        treeView.redraw();
    });
    const ul = div._ul();
    const treeView = {
        tree: treeProvider,
        redraw: redraw,
        node: div,
        collapsed: true
    };
    return treeView;
}

Node.prototype._pagedTable = function(columns: string[], pageSize: number, rows: RowProvider) {
    let once = true;
    function redraw() {
        const rows = pagedTable.rows();
        if(pagedTable.index + pagedTable.pageSize > rows.n) {
            pagedTable.pageSize = rows.n - pagedTable.index;
        }
        if(pagedTable.index < 0) {
            pagedTable.index = 0;
        }
        if(pagedTable.index >= rows.n) {
            pagedTable.index = rows.n - 1;
        }

        indexInput.value = String(pagedTable.index);
        indexToInput.value = String(pagedTable.index + pagedTable.pageSize);
        firstButton.disabled = pagedTable.index === 0;
        prevButton.disabled = pagedTable.index === 0;
        nextButton.disabled = pagedTable.index + pagedTable.pageSize >= rows.n;
        lastButton.disabled = pagedTable.index + pagedTable.pageSize >= rows.n;

        buttonsText.textContent = " / " + rows.n + " ";
        const n = Math.min(pagedTable.index + pagedTable.pageSize, rows.n);
        nrows = rows.n;
        indexInput.max = String(nrows - pagedTable.pageSize);
        indexToInput.max = String(nrows);
        tbody._draw(() => {
            for(let i =  pagedTable.index; i < n; ++i) {
                const row = tbody._tr();
                rows.ith(i, row);
            }
        });
    }

    let nrows = 0;
    const div = this._div();
    const table = div._table(... columns);
    let tbody: HTMLTableSectionElement = table.provideNode(() => document.createElement("tbody"));
    const buttons = div._div()._class("table-buttons");
    buttons._text(" Rækker: ");
    const indexInput = buttons._input("Rækker", "number", "0", newIndex => {
        pagedTable.index = +newIndex;
        redraw();
    });
    buttons._text(" - ");
    const indexToInput = buttons._input("Rækker", "number", "0", newIndex => {
        pagedTable.pageSize = (+newIndex) - pagedTable.index;
        redraw();
    });
    indexToInput.style.width = "100px";
    indexInput.style.width = "100px";
    indexToInput.min = "0";
    indexInput.min = "0";

    const buttonsText = buttons._text(" / 0 ");
    const firstButton = buttons._button("<<", () => {
        pagedTable.index = 0;
        redraw();
    });
    firstButton.style.marginLeft = "88px";
    const prevButton = buttons._button("<", () => {
        pagedTable.index = Math.max(0, pagedTable.index - pagedTable.pageSize);
        redraw();
    });
    const nextButton = buttons._button(">", () => {
        pagedTable.index = Math.min(pagedTable.index + pagedTable.pageSize, nrows - pagedTable.pageSize);
        redraw();
    });
    const lastButton = buttons._button(">>", () => {
        pagedTable.index = Math.max(0, nrows - pagedTable.pageSize);
        redraw();
    });

    const pagedTable = {
        redraw: redraw,
        rows: rows,
        index: 0,
        pageSize: pageSize,
        node: div
    };
    return pagedTable;
}

Node.prototype._text = function(text: string) {
    const result = this.provideNode(() => document.createTextNode(""));
    result.textContent = text;
    return result;
}

Node.prototype._button = function(text: string, action: () => void = () => {}) {
    const button = this.provideNode(() => document.createElement("button"));
    button.innerHTML = text;
    button.onclick = action;
    return button;
}

Node.prototype._select = function(options: string[], j: number, onchange: (i: number) => void = () => {}) {
    const sel = this.provideNode(() => document.createElement("select"));
    sel.selectedIndex = j;
    sel.onchange = (x) => {
        if(sel.selectedIndex >= 0 && sel.selectedIndex < options.length)
            onchange(sel.selectedIndex);
    };
    for(let i = 0; i < options.length; ++i) {
        const opt = sel.provideNode(() => document.createElement("option"));
        opt.textContent = options[i];
        opt.value = options[i];
    }
    return sel;
}

Node.prototype._input = function(placeholder: string, type: string, value: string, onchange: (value: string) => void = () => {}) {
    const input = this.provideNode(() => document.createElement("input"));
    input.placeholder = placeholder;
    input.type = type;
    input.value = value;
    input.onchange = () => onchange(input.value);
    return input;
}

function formatDate(date: Date): string {
    const day = ("0" + date.getDate()).slice(-2);
    const month = ("0" + (date.getMonth() + 1)).slice(-2);
    return date.getFullYear() + "-" + month + "-" + day;
}

function formatTime(date: Date): string {
    const hour = ("0" + date.getHours()).slice(-2);
    const minute = ("0" + date.getMinutes()).slice(-2);
    return hour + ":" + minute;
}

Node.prototype._inputDate = function(value: Date, onchange: () => void = () => {}) {
    const input = this.provideNode(() => document.createElement("input"));
    input.type = "date";
    input.value = formatDate(value);
    input.onchange = () => {
        if(input.valueAsDate) {
            value.setMonth(input.valueAsDate.getMonth());
            value.setDate(input.valueAsDate.getDate());
            value.setFullYear(input.valueAsDate.getFullYear());
            onchange();
        }
    };
    return input
}

Node.prototype._inputTime = function(value: Date, onchange: () => void = () => {}) {
    const input = this.provideNode(() => document.createElement("input"));
    input.type = "time";
    input.value = formatTime(value);
    input.onchange = () => {
        if(input.valueAsDate) {
            value.setMinutes(input.valueAsDate.getUTCMinutes());
            value.setHours(input.valueAsDate.getUTCHours());
            onchange();
        }
    };
    return input
}

Node.prototype._inputNumber = function(placeholder: string, value: number, onchange: (value: number) => void = () => {}) {
    const input = this.provideNode(() => document.createElement("input"));
    input.type = "number";
    input.pattern ="\\d*";
    input.placeholder = placeholder;
    input.value = String(value);
    input.onchange = () => {
        if(!isNaN(input.valueAsNumber)) {
            onchange(input.valueAsNumber);
        }
    }
    return input;
}

Node.prototype._inputWeight = function(placeholder: string, value: number,
    onchange: (value: number) => void = () => {},
    oninput: (value: number) => void = () => {}) {
    const input = this.provideNode(() => document.createElement("input"));
    input.type = "number";
    input.step = "0.1";
    input.min = "50";
    input.max = "200";
    input.pattern ="\\d*";
    input.placeholder = placeholder;
    input.value = String(value);
    input.onchange = () => {
        if(!isNaN(input.valueAsNumber)) {
            onchange(input.valueAsNumber);
        }
    }
    input.oninput = () => {
        if(input.value[0] !== "1" && input.value.length === 3 && input.value.match(/\d*/)) {
            input.value = input.value.substr(0, 2) + "." + input.value.substr(2,1);
        }
        if(input.value[0] === "1" && input.value.length === 4) {
            input.value = input.value.substr(0, 3) + "." + input.value.substr(3,1);
        }
        if(!isNaN(input.valueAsNumber)) {
            oninput(input.valueAsNumber);
        }
    }
    return input;
}

Node.prototype._checkbox = function(value: boolean, onchange: (isChecked : boolean) => void = () => {}) {
    const input = this.provideNode(() => document.createElement("input"));
    input.type = "checkbox";
    input.checked = value;
    input.onchange = () => onchange(input.checked);
    return input;
}

Node.prototype._paragraph = function(text: string) {
    const p = this.provideNode(() => document.createElement("p"));
    p.innerHTML = text;
    return p;
}


function error(err: string) {
    const msg = "Øv der er sket en fejl: ";
    if(document.body)
        document.body.innerHTML = msg + err;
    else
        window.onload = () => {
            document.body.innerHTML = msg + err;
        }
}

export function makeSite(r : {makeSite: (parent: Node) => Promise<void>}) {
    if(r) {
        if(document.body) {
            document.body.innerHTML= "";
            try{
                const frag = document.createDocumentFragment();
                r.makeSite(frag).then(() => document.body.appendChild(frag));
            }
            catch(err) {
                error(err.toString());
            }
        }
        else
            window.onload = () => {
                try {
                    r.makeSite(document.body);
                }
                catch(err) {
                    error(err.toString());
                }
            }
    }
    else {
        error("Bad URL");
    }
}
