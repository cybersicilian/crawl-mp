/* Real overview refresh with tutorial and changing saves; no browser or network. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(process.env.LOBBY_OVERVIEW_SOURCE||path.join(__dirname,'../static/scripts/lobby-overview.js'),'utf8');
function fixture(tutorialPresent=true,saved=false){
    const ids=new Map();let entries=[],overview;
    class Element{
        constructor(tag){this.tagName=tag;this.children=[];this.attrs={};this.dataset={};this.className='';this.ownText='';
            this.classList={toggle:(name,value)=>{const list=new Set(this.className.split(' ').filter(Boolean));if(value)list.add(name);else list.delete(name);this.className=[...list].join(' ');}};}
        set href(value){this.attrs.href=value;}get href(){return this.attrs.href;}
        set id(value){this.attrs.id=value;ids.set(value,this);}get id(){return this.attrs.id;}
        set textContent(value){this.ownText=String(value);this.children=[];}get textContent(){return this.ownText+this.children.map(c=>c.textContent).join('');}
        get innerHTML(){return JSON.stringify([this.tagName,this.className,this.attrs,this.dataset,this.ownText,this.children.map(c=>c.innerHTML)]);}
        append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
        appendChild(child){this.append(child);return child;}
        replaceChildren(...children){this.children=[];this.append(...children);}
        insertBefore(child,before){child.parent=this;const i=this.children.indexOf(before);this.children.splice(i<0?this.children.length:i,0,child);}
        setAttribute(name,value){this.attrs[name]=String(value);}getAttribute(name){return this.attrs[name]??this[name]??null;}
        removeAttribute(name){delete this.attrs[name];}
        remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}
        matches(selector){
            if(selector==='[data-library-load]')return this.dataset.libraryLoad!==undefined;
            if(selector.startsWith('.'))return this.className.split(' ').includes(selector.slice(1));
            return this.tagName===selector;
        }
        querySelectorAll(selector){const choices=selector.split(',').map(v=>v.trim()),all=this.children.flatMap(c=>[c,...c.querySelectorAll('*')]);return selector==='*'?all:all.filter(c=>choices.some(s=>c.matches(s)));}
        querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
        cloneNode(deep){const copy=new Element(this.tagName);copy.attrs={...this.attrs};copy.dataset={...this.dataset};copy.className=this.className;copy.ownText=this.ownText;if(deep)copy.append(...this.children.map(c=>c.cloneNode(true)));return copy;}
    }
    const root=new Element('main'),panel=new Element('section'),library=new Element('section');panel.id='party_lobby_panel';library.id='game_library_panel';root.append(panel,library);
    const tutorial=new Element('a');tutorial.href='#play-tut-web-trunk';tutorial.textContent='Tutorial';
    const document={createElement:tag=>new Element(tag),getElementById:id=>ids.get(id)||null,
        querySelector:selector=>selector.startsWith('#play_now')&&tutorialPresent?tutorial:null,
        querySelectorAll:selector=>selector==='#game_library_panel .game-library-entry'?entries:[]};
    function setSaved(value){
        entries=[];
        if(value){const entry=new Element('article');entry.className='game-library-entry';entry.dataset={saved:'5',order:'0'};
            const title=new Element('h3');title.textContent='Existing expedition';const meta=new Element('small');meta.textContent='D:4 · Turn 50';
            const resume=new Element('a');resume.dataset.libraryLoad='saved-id';resume.href='#expedition-saved-id';resume.textContent='Resume';entry.append(title,meta,resume);entries.push(entry);}
        library.replaceChildren(...entries);
    }
    setSaved(saved);
    vm.runInNewContext(source,{document,window:{},define(dependencies,factory){
        const modules={'expedition-creation':{choice(id){const node=new Element('fieldset');node.id=id;return node;}},'hero-role':{decorate(){}}};
        overview=factory(...dependencies.map(name=>modules[name]));
    }});
    return{overview,root,setSaved,tutorial,all:()=>root.querySelectorAll('*')};
}
test('tutorial-present empty lobby initializes and refreshes repeatedly without shadowing its help link',()=>{
    const f=fixture();assert.doesNotThrow(()=>f.overview.init(f.root));
    for(let i=0;i<20;i++)assert.doesNotThrow(()=>f.overview.refresh());
    const help=f.all().filter(node=>node.tagName==='a'&&(/tutorial/i.test(node.textContent)||node.textContent==='How to play'));
    assert(help.length>0);assert(help.every(node=>node.href==='#play-tut-web-trunk'));
});
test('tutorial-present refresh handles saved and empty histories while retaining exact resume links',()=>{
    const f=fixture(true,true);f.overview.init(f.root);f.overview.refresh();
    assert(f.all().some(node=>node.tagName==='a'&&node.dataset.libraryLoad==='saved-id'&&node.href==='#expedition-saved-id'));
    f.setSaved(false);assert.doesNotThrow(()=>f.overview.refresh());f.setSaved(true);assert.doesNotThrow(()=>f.overview.refresh());
});
test('missing tutorial preserves the normal lobby refresh fallback',()=>{
    const f=fixture(false);assert.doesNotThrow(()=>f.overview.init(f.root));assert.doesNotThrow(()=>f.overview.refresh());
});
