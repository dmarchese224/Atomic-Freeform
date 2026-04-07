const state={dirHandle:null,entries:{},allTags:{},activeDate:null,filterTag:null,searchQuery:'',calYear:0,calMonth:0,blocks:{doing:[],thoughts:[],ahead:[]},theme:'dark'};
const BLOCK_TYPES=[{id:'doing',label:'What am I doing?'},{id:'thoughts',label:'Important thoughts'},{id:'ahead',label:'Looking ahead'}];
const $=s=>document.querySelector(s); const $$=s=>Array.from(document.querySelectorAll(s));
const todayStr=()=>new Date().toISOString().slice(0,10);
const fmtDisplay=s=>new Date(s+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
const wordCount=t=>(t||'').trim().split(/\s+/).filter(Boolean).length;
const slugTag=t=>t.toLowerCase().replace(/[^a-z0-9]/g,'');

function showToast(msg,d=2200){const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(window.__toast); window.__toast=setTimeout(()=>t.classList.remove('show'),d);} 
function applyTheme(t){state.theme=t; document.documentElement.setAttribute('data-theme',t); const dm=$('#darkModeToggle'); if(dm) dm.checked=t==='dark';}
function updateTopbarDate(){ $('#topbarDate').textContent=new Date().toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}); }
function markUnsaved(){ $('#saveStatusText').textContent='Unsaved changes'; }
function markSaved(){ $('#saveStatusText').textContent='Saved'; }

function renderBlocks(){
    BLOCK_TYPES.forEach(bt=>{
        const box=$('#sec_'+bt.id);
        if(!box) return;
        box.innerHTML='';
        if(!state.blocks[bt.id]) state.blocks[bt.id] = [];
        state.blocks[bt.id].forEach((block,idx)=>{
            const card=document.createElement('div');
            card.className='prompt-card';
            // Secure text to prevent HTML breaks
            const safeText = block.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
            card.innerHTML=`
                <div class="prompt-header">
                    <span class="prompt-question">Block ${idx+1}</span>
                    <button class="icon-btn" style="color:var(--color-error)" onclick="window.removeBlock('${bt.id}','${block.id}')"><i data-lucide="trash-2" style="width:16px;height:16px"></i></button>
                </div>
                <div class="prompt-body">
                    <textarea class="prompt-textarea" oninput="window.updateBlockText('${bt.id}','${block.id}',this.value)" placeholder="Write your ${bt.label.toLowerCase()}...">${safeText}</textarea>
                </div>
                <div class="tags-input-area" style="border-top:1px solid var(--color-divider)">
                    <div id="tags_${block.id}" style="display:flex;gap:var(--space-2);flex-wrap:wrap">
                        ${block.tags.map(t=>`<span class="entry-tag">#${t} <button type="button" onclick="window.removeBlockTag('${bt.id}','${block.id}','${t}')">×</button></span>`).join('')}
                    </div>
                    <input type="text" class="tags-text-input" placeholder="Add tag & press Enter..." onkeydown="window.handleTagInput(event,'${bt.id}','${block.id}')">
                </div>
            `;
            box.appendChild(card);
        });
    });
    if(window.lucide) lucide.createIcons();
    updateWordCount();
}

window.addBlock = (type) => {
    if(!state.blocks[type]) state.blocks[type] = [];
    state.blocks[type].push({id: Date.now()+'_'+Math.random().toString(36).substr(2,5), text:'', tags:[]});
    renderBlocks();
    markUnsaved();
};
window.removeBlock = (type, id) => {
    if(state.blocks[type]) state.blocks[type] = state.blocks[type].filter(b=>b.id!==id);
    renderBlocks();
    markUnsaved();
};
window.updateBlockText = (type, id, text) => {
    if(!state.blocks[type]) return;
    const b = state.blocks[type].find(x=>x.id===id);
    if(b) { b.text=text; updateWordCount(); markUnsaved(); }
};
window.removeBlockTag = (type, id, tag) => {
    if(!state.blocks[type]) return;
    const b = state.blocks[type].find(x=>x.id===id);
    if(b) { b.tags = b.tags.filter(t=>t!==tag); renderBlocks(); markUnsaved(); }
};
window.handleTagInput = (e, type, id) => {
    if(e.key==='Enter'||e.key===','){
        e.preventDefault();
        const v = slugTag(e.target.value.trim().replace(/^#/,''));
        if(v){
            if(!state.blocks[type]) return;
            const b = state.blocks[type].find(x=>x.id===id);
            if(b && !b.tags.includes(v)){
                b.tags.push(v);
                renderBlocks();
                markUnsaved();
            }
        }
        e.target.value='';
    }
};

function renderTagList(){ 
    const box=$('#tagList'); 
    box.innerHTML=''; 
    const items=Object.entries(state.allTags).sort((a,b)=>b[1]-a[1]); 
    if(!items.length){box.innerHTML='<div style="font-size:var(--text-xs);color:var(--color-text-faint);padding:var(--space-2) var(--space-4)">No tags yet</div>'; return;} 
    items.forEach(([tag,count])=>{ 
        const b=document.createElement('button'); 
        b.className='tag-list-item'+(state.filterTag===tag?' active':''); 
        b.innerHTML=`<span>#${tag}</span><span class="tag-count">${count}</span>`; 
        b.onclick=()=>{state.filterTag=state.filterTag===tag?null:tag; switchView('browse'); renderTagList(); renderEntriesList();}; 
        box.appendChild(b);
    }); 
}

function parseEntry(text){
    const r={tags:[],blocks:{doing:[],thoughts:[],ahead:[]},preview:''};
    if(!text) return r;
    
    try {
        // Standardize line endings safely
        const normText = text.replace(/\r\n/g, '\n');
        const fm=normText.match(/^---\n([\s\S]*?)\n---/);
        let globalTags = new Set();
        let allText = [];

        if (fm && fm[1]) {
            const m = fm[1].match(/^tags:\s*\[([^\]]*)\]/m);
            if (m && m[1]) {
                m[1].split(',').forEach(t => { 
                    const clean=t.trim().replace(/^#/,''); 
                    if(clean) globalTags.add(clean); 
                });
            }
        }

        BLOCK_TYPES.forEach(bt=>{
            const header = '## ' + bt.label;
            const startIdx = normText.indexOf(header);
            
            if(startIdx !== -1) {
                let sectionText = normText.slice(startIdx + header.length);
                const nextHeaderIdx = sectionText.indexOf('\n## ');
                if(nextHeaderIdx !== -1) {
                    sectionText = sectionText.slice(0, nextHeaderIdx);
                }
                
                const blockRegex=/([\s\S]*?)/g;
                let bm;
                while((bm=blockRegex.exec(sectionText))!==null){
                    const bText = (bm[1]||'').trim();
                    const tagsStr = (bm[2]||'').trim();
                    const bTags = tagsStr ? tagsStr.split(/\s+/).map(t=>t.trim().replace(/^#/,'')).filter(Boolean) : [];
                    
                    r.blocks[bt.id].push({id:Date.now()+'_'+Math.random().toString(36).substr(2,5), text:bText, tags:bTags});
                    bTags.forEach(t=>globalTags.add(t));
                    if(bText) allText.push(bText);
                }
            }
        });
        r.tags = Array.from(globalTags);
        r.preview = allText.join(' ').slice(0,220);
    } catch(err) {
        console.error("Parse error handled gracefully:", err);
    }
    return r;
}

function clearForm(){
    state.blocks = { doing: [{id:'1',text:'',tags:[]}], thoughts: [{id:'2',text:'',tags:[]}], ahead: [{id:'3',text:'',tags:[]}] };
    renderBlocks();
    updateWordCount();
}

function updateWordCount(){
    let txt='';
    BLOCK_TYPES.forEach(bt => {
        if(state.blocks[bt.id]) state.blocks[bt.id].forEach(b => txt+=b.text+' ')
    });
    const wc=wordCount(txt);
    $('#wordCountBadge').textContent=wc+' '+(wc===1?'word':'words');
}

function buildMd(dateStr){
    const allTags = new Set();
    try {
        BLOCK_TYPES.forEach(bt => {
            if(state.blocks[bt.id]){
                state.blocks[bt.id].forEach(b => {
                    if(b.tags) b.tags.forEach(t => allTags.add(t))
                })
            }
        });
    } catch(e){}

    const tagsArr = Array.from(allTags);
    const tagsFm = tagsArr.length ? '[' + tagsArr.map(t => '#' + t).join(', ') + ']' : '[]';

    let md=`---\ndate: ${dateStr}\ntags: ${tagsFm}\n---\n\n`;
    BLOCK_TYPES.forEach(bt=>{
        if(state.blocks[bt.id] && state.blocks[bt.id].length>0){
            md+=`## ${bt.label}\n\n`;
            state.blocks[bt.id].forEach(b=>{
                const tagsStr = (b.tags||[]).map(t=>'#'+t).join(' ');
                md+=`${(b.text||'').trim()}\n\n\n`;
            });
        }
    });
    return md.trimEnd()+'\n';
}

async function loadAllEntries(){ 
    if(!state.dirHandle) return; 
    state.entries={}; 
    state.allTags={}; 
    for await(const [name,handle] of state.dirHandle.entries()){ 
        if(handle.kind==='file'&&/^\d{4}-\d{2}-\d{2}\.md$/.test(name)){ 
            try {
                const text=await (await handle.getFile()).text(); 
                const dateKey=name.replace('.md',''); 
                const parsed=parseEntry(text); 
                state.entries[dateKey]={text,parsed}; 
                (parsed.tags||[]).forEach(t=>state.allTags[t]=(state.allTags[t]||0)+1); 
            } catch(err){
                console.error("Skipped corrupted file:", name, err);
            }
        } 
    } 
    renderTagList(); 
    renderMiniCal(); 
}

async function openFolder(){ if(!window.showDirectoryPicker){showToast('Use Chrome, Edge, or Arc for folder access.',3500); return;} try{ state.dirHandle=await window.showDirectoryPicker({mode:'readwrite'}); $('#folderPath').textContent=state.dirHandle.name; await loadAllEntries(); await openEntryForDate(state.activeDate||todayStr()); showToast('Folder opened: '+state.dirHandle.name);}catch(e){ if(e.name!=='AbortError') showToast('Could not open folder'); } }

async function saveEntry(){ 
    if(!state.dirHandle){showToast('Open a folder first'); return;} 
    try{ 
        const md=buildMd(state.activeDate); 
        const fh=await state.dirHandle.getFileHandle(state.activeDate+'.md',{create:true}); 
        const w=await fh.createWritable(); 
        await w.write(md); 
        await w.close(); 
        const parsed=parseEntry(md); 
        state.entries[state.activeDate]={text:md,parsed}; 
        state.allTags={}; 
        Object.values(state.entries).forEach(e=>(e.parsed.tags||[]).forEach(t=>state.allTags[t]=(state.allTags[t]||0)+1)); 
        renderTagList(); 
        renderMiniCal(); 
        markSaved(); 
        showToast('Entry saved'); 
    }catch(e){ 
        console.error("Save error:", e);
        showToast('Save failed'); 
    } 
}

async function openEntryForDate(dateStr){ 
    state.activeDate=dateStr; 
    $('#entryDateDisplay').textContent=fmtDisplay(dateStr); 
    $('#entryFilename').textContent=dateStr+'.md'; 
    $('#hiddenDatePicker').value=dateStr; 
    if(!state.dirHandle){ $('#noFolderMsg').style.display='flex'; $('#entryForm').style.display='none'; return; } 
    $('#noFolderMsg').style.display='none'; 
    $('#entryForm').style.display='flex'; 
    if(state.entries[dateStr]){ 
        state.blocks = JSON.parse(JSON.stringify(state.entries[dateStr].parsed.blocks)); 
        renderBlocks(); 
    }else{ 
        clearForm(); 
    } 
    markSaved(); 
    renderMiniCal(); 
}

function renderEntriesList(){ 
    const keys=Object.keys(state.entries).sort((a,b)=>b.localeCompare(a)); 
    const q=state.searchQuery.toLowerCase(); 
    const filtered=keys.filter(k=>{ 
        const e=state.entries[k]; 
        if(state.filterTag && !(e.parsed.tags||[]).includes(state.filterTag)) return false; 
        if(q && !e.text.toLowerCase().includes(q)) return false; 
        return true; 
    }); 
    $('#browseSubtitle').textContent=state.filterTag?`Filtered by #${state.filterTag} — ${filtered.length} entries`:q?`Search: "${q}" — ${filtered.length} results`:`${filtered.length} entries`; 
    $('#clearTagFilter').style.display=(state.filterTag||q)?'flex':'none'; 
    const box=$('#entriesList'); 
    if(!filtered.length){ box.innerHTML='<div class="empty-state"><div class="empty-icon"><i data-lucide="book-open"></i></div><h3>No matches found</h3><p>Try a different search or filter.</p></div>'; return; } 
    box.innerHTML=''; 
    filtered.forEach(k=>{ 
        const e=state.entries[k].parsed; 
        const card=document.createElement('div'); 
        card.className='entry-card'; 
        card.innerHTML=`<div class="entry-card-top"><div class="entry-card-date">${fmtDisplay(k)}</div></div><div class="entry-card-preview">${e.preview||''}</div><div class="entry-card-tags">${(e.tags||[]).map(t=>`<span class="mini-tag">#${t}</span>`).join('')}</div>`; 
        card.onclick=()=>{switchView('today'); openEntryForDate(k);}; 
        box.appendChild(card); 
    }); 
}

function renderMiniCal(){ 
    const now=new Date(); 
    if(!state.calYear){state.calYear=now.getFullYear(); state.calMonth=now.getMonth();} 
    const y=state.calYear,m=state.calMonth; 
    $('#calMonthLabel').textContent=new Date(y,m,1).toLocaleDateString('en-US',{month:'long',year:'numeric'}); 
    const grid=$('#calGrid'); 
    grid.innerHTML=''; 
    ['Su','Mo','Tu','We','Th','Fr','Sa'].forEach(d=>{ const el=document.createElement('div'); el.className='cal-dow'; el.textContent=d; grid.appendChild(el);}); 
    const first=new Date(y,m,1).getDay(); 
    const days=new Date(y,m+1,0).getDate(); 
    for(let i=0;i<first;i++){ const e=document.createElement('div'); e.className='cal-day'; grid.appendChild(e);} 
    for(let d=1; d<=days; d++){ 
        const ds=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; 
        const el=document.createElement('div'); 
        el.className='cal-day'; 
        if(ds===todayStr()) el.classList.add('today'); 
        if(ds===state.activeDate) el.classList.add('selected'); 
        if(state.entries[ds]) el.classList.add('has-entry'); 
        el.textContent=d; 
        el.onclick=()=>openEntryForDate(ds); 
        grid.appendChild(el);
    } 
}

function switchView(name){ 
    $$('.nav-item[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name)); 
    $$('.view').forEach(v=>v.classList.remove('active')); 
    $('#view-'+name).classList.add('active'); 
}

document.addEventListener('DOMContentLoaded',()=>{ 
    applyTheme('dark'); updateTopbarDate(); openEntryForDate(todayStr()); renderMiniCal(); 
    if(window.showDirectoryPicker) $('#fsapiStatus').innerHTML='<span style="color:var(--color-success)">✓ File System Access API is available.</span>'; else $('#fsapiStatus').innerHTML='<span style="color:var(--color-warning)">⚠ File System Access API is not available in this browser.</span>'; 
    if(window.lucide) lucide.createIcons(); 
    $('#themeToggle').onclick=()=>applyTheme(state.theme==='dark'?'light':'dark'); 
    $('#darkModeToggle').onchange=e=>applyTheme(e.target.checked?'dark':'light'); 
    $('#openFolderBtn').onclick=openFolder; $('#emptyOpenFolderBtn').onclick=openFolder; $('#settingsOpenBtn').onclick=openFolder; 
    $('#newEntryBtn').onclick=()=>{switchView('today'); openEntryForDate(todayStr());}; 
    $('#saveEntryBtn').onclick=saveEntry; $('#clearEntryBtn').onclick=()=>{if(confirm('Clear this entry?')) clearForm();}; 
    $('#sidebarToggle').onclick=()=>$('#sidebar').classList.toggle('collapsed'); 
    $('#mobileSidebarToggle').onclick=()=>{$('#sidebar').classList.add('mobile-open'); $('#mobileBackdrop').classList.add('visible');}; 
    $('#mobileBackdrop').onclick=()=>{$('#sidebar').classList.remove('mobile-open'); $('#mobileBackdrop').classList.remove('visible');}; 
    $$('.nav-item[data-view]').forEach(b=>b.onclick=()=>{switchView(b.dataset.view); if(b.dataset.view==='browse') renderEntriesList();}); 
    $('#quickSearch').addEventListener('input',e=>{ state.searchQuery=e.target.value.trim(); state.filterTag=null; renderTagList(); switchView('browse'); renderEntriesList(); }); 
    $('#clearTagFilter').onclick=()=>{ state.filterTag=null; state.searchQuery=''; $('#quickSearch').value=''; renderTagList(); renderEntriesList(); }; 
    $('#refreshBtn').onclick=async()=>{ if(state.dirHandle){ await loadAllEntries(); openEntryForDate(state.activeDate||todayStr()); showToast('Entries reloaded'); } }; 
    $('#pickDateBtn').onclick=()=>$('#hiddenDatePicker').click(); 
    $('#hiddenDatePicker').onchange=e=>e.target.value&&openEntryForDate(e.target.value); 
    $('#calPrev').onclick=()=>{state.calMonth--; if(state.calMonth<0){state.calMonth=11;state.calYear--;} renderMiniCal();}; 
    $('#calNext').onclick=()=>{state.calMonth++; if(state.calMonth>11){state.calMonth=0;state.calYear++;} renderMiniCal();}; 
});