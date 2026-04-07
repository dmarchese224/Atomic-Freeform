const state={dirHandle:null,entries:{},allTags:{},activeFilename:null,filterTag:null,searchQuery:'',entryTitle:'',entryText:'',entryTags:[],theme:'dark'};
const $=s=>document.querySelector(s); const $$=s=>Array.from(document.querySelectorAll(s));
const wordCount=t=>(t||'').trim().split(/\s+/).filter(Boolean).length;
const slugTag=t=>t.toLowerCase().replace(/[^a-z0-9]/g,'');

function showToast(msg,d=2200){const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(window.__toast); window.__toast=setTimeout(()=>t.classList.remove('show'),d);} 
function applyTheme(t){state.theme=t; document.documentElement.setAttribute('data-theme',t); const dm=$('#darkModeToggle'); if(dm) dm.checked=t==='dark';}
function markUnsaved(){ $('#saveStatusText').textContent='Unsaved changes'; }
function markSaved(){ $('#saveStatusText').textContent='Saved'; }

function renderTagChips(){ 
    const box=$('#tagChips'); box.innerHTML=''; 
    state.entryTags.forEach(tag=>{ 
        const span=document.createElement('span'); 
        span.className='entry-tag'; 
        span.innerHTML=`#${tag} <button type="button">×</button>`; 
        span.querySelector('button').onclick=()=>{state.entryTags=state.entryTags.filter(t=>t!==tag); renderTagChips(); markUnsaved();}; 
        box.appendChild(span);
    }); 
}

function renderTagList(){ const box=$('#tagList'); box.innerHTML=''; const items=Object.entries(state.allTags).sort((a,b)=>b[1]-a[1]); if(!items.length){box.innerHTML='<div style="font-size:var(--text-xs);color:var(--color-text-faint);padding:var(--space-2) var(--space-4)">No tags yet</div>'; return;} items.forEach(([tag,count])=>{ const b=document.createElement('button'); b.className='tag-list-item'+(state.filterTag===tag?' active':''); b.innerHTML=`<span>#${tag}</span><span class="tag-count">${count}</span>`; b.onclick=()=>{state.filterTag=state.filterTag===tag?null:tag; switchView('browse'); renderTagList(); renderEntriesList();}; box.appendChild(b);}); }

function parseEntry(text, filename){ 
    const r={title: filename.replace(/\.md$/i, ''), tags:[], text:'', preview:''}; 
    const fm=text.match(/^---\n([\s\S]*?)\n---/); 
    let body = text;
    if(fm){
        const s=fm[1]; 
        let m=s.match(/^title:\s*(.+)$/m);
        if(m) r.title = m[1].trim();
        m=s.match(/^tags:\s*\[([^\]]*)\]/m); 
        if(m) r.tags=m[1].split(',').map(t=>t.trim().replace(/^#/, '')).filter(Boolean);
        body = text.slice(fm[0].length).trim();
    }
    r.text = body;
    r.preview = body.slice(0,220).replace(/\n/g,' '); 
    return r; 
}

function populateForm(parsed){ 
    state.entryTitle = parsed.title || '';
    state.entryText = parsed.text || '';
    state.entryTags = [...(parsed.tags || [])];
    $('#noteTitle').value = state.entryTitle;
    $('#freeformText').value = state.entryText;
    renderTagChips(); 
    updateWordCount(); 
}

function clearForm(){ 
    state.activeFilename = null;
    state.entryTitle = '';
    state.entryText = '';
    state.entryTags = [];
    $('#noteTitle').value = '';
    $('#freeformText').value = '';
    $('#entryFilename').textContent = 'Untitled.md';
    renderTagChips(); 
    updateWordCount(); 
    markSaved();
}

function updateWordCount(){ 
    const wc=wordCount($('#freeformText').value); 
    $('#wordCountBadge').textContent=wc+' '+(wc===1?'word':'words'); 
}

function buildMd(){ 
    const tags=state.entryTags.length?'['+state.entryTags.map(t=>'#'+t).join(', ')+']':'[]'; 
    const safeTitle = $('#noteTitle').value.trim() || 'Untitled';
    let md=`---\ntitle: ${safeTitle}\ntags: ${tags}\n---\n\n`; 
    md += ($('#freeformText').value || '').trim() + '\n';
    return md; 
}

async function loadAllEntries(){ 
    if(!state.dirHandle) return; 
    state.entries={}; 
    state.allTags={}; 
    for await(const [name,handle] of state.dirHandle.entries()){ 
        if(handle.kind==='file' && name.endsWith('.md')){ 
            const text=await (await handle.getFile()).text(); 
            const parsed=parseEntry(text, name); 
            state.entries[name]={text,parsed}; 
            (parsed.tags||[]).forEach(t=>state.allTags[t]=(state.allTags[t]||0)+1); 
        } 
    } 
    renderTagList(); 
}

async function openFolder(){ 
    if(!window.showDirectoryPicker){showToast('Use Chrome, Edge, or Arc for folder access.',3500); return;} 
    try{ 
        state.dirHandle=await window.showDirectoryPicker({mode:'readwrite'}); 
        $('#folderPath').textContent=state.dirHandle.name; 
        await loadAllEntries(); 
        clearForm(); // Start with a fresh note when opening folder
        $('#noFolderMsg').style.display='none'; 
        $('#entryForm').style.display='flex';
        showToast('Folder opened: '+state.dirHandle.name);
    }catch(e){ 
        if(e.name!=='AbortError') showToast('Could not open folder'); 
    } 
}

async function saveEntry(){ 
    if(!state.dirHandle){showToast('Open a folder first'); return;} 
    
    const titleRaw = $('#noteTitle').value.trim() || 'Untitled';
    // Make filename safe for file systems
    const newFilename = titleRaw.replace(/[/\\?%*:|"<>]/g, '-') + '.md';
    const md = buildMd(); 

    try { 
        // If the title changed, delete the old file so we effectively "rename" it
        if (state.activeFilename && state.activeFilename !== newFilename) {
            try { 
                await state.dirHandle.removeEntry(state.activeFilename); 
                delete state.entries[state.activeFilename];
            } catch(e) { console.warn('Could not remove old file:', e); }
        }

        const fh=await state.dirHandle.getFileHandle(newFilename,{create:true}); 
        const w=await fh.createWritable(); 
        await w.write(md); 
        await w.close(); 
        
        state.activeFilename = newFilename;
        $('#entryFilename').textContent = newFilename;

        const parsed=parseEntry(md, newFilename); 
        state.entries[newFilename]={text:md,parsed}; 
        
        state.allTags={}; 
        Object.values(state.entries).forEach(e=>(e.parsed.tags||[]).forEach(t=>state.allTags[t]=(state.allTags[t]||0)+1)); 
        renderTagList(); 
        markSaved(); 
        showToast('Note saved'); 
    } catch(e) { 
        showToast('Save failed'); 
    } 
}

async function openEntry(filename){ 
    state.activeFilename=filename; 
    $('#entryFilename').textContent=filename; 
    
    if(!state.dirHandle){ 
        $('#noFolderMsg').style.display='flex'; 
        $('#entryForm').style.display='none'; 
        return; 
    } 
    $('#noFolderMsg').style.display='none'; 
    $('#entryForm').style.display='flex'; 
    
    if(filename && state.entries[filename]) {
        populateForm(state.entries[filename].parsed); 
    } else {
        clearForm(); 
    }
    markSaved(); 
}

function renderEntriesList(){ 
    // Sort A-Z by filename
    const keys=Object.keys(state.entries).sort((a,b)=>a.localeCompare(b)); 
    const q=state.searchQuery.toLowerCase(); 
    const filtered=keys.filter(k=>{ 
        const e=state.entries[k]; 
        if(state.filterTag && !(e.parsed.tags||[]).includes(state.filterTag)) return false; 
        if(q && !e.text.toLowerCase().includes(q) && !e.parsed.title.toLowerCase().includes(q)) return false; 
        return true; 
    }); 
    
    $('#browseSubtitle').textContent=state.filterTag?`Filtered by #${state.filterTag} — ${filtered.length} notes`:q?`Search: "${q}" — ${filtered.length} results`:`${filtered.length} notes`; 
    $('#clearTagFilter').style.display=(state.filterTag||q)?'flex':'none'; 
    const box=$('#entriesList'); 
    
    if(!filtered.length){ 
        box.innerHTML='<div class="empty-state"><div class="empty-icon"><i data-lucide="book-open"></i></div><h3>No matches found</h3><p>Try a different search or filter.</p></div>'; 
        return; 
    } 
    
    box.innerHTML=''; 
    filtered.forEach(k=>{ 
        const e=state.entries[k].parsed; 
        const card=document.createElement('div'); 
        card.className='entry-card'; 
        card.innerHTML=`<div class="entry-card-top"><div class="entry-card-date" style="font-size:var(--text-lg)">${e.title}</div></div><div class="entry-card-preview">${e.preview||''}</div><div class="entry-card-tags">${(e.tags||[]).map(t=>`<span class="mini-tag">#${t}</span>`).join('')}</div>`; 
        card.onclick=()=>{switchView('editor'); openEntry(k);}; 
        box.appendChild(card); 
    }); 
}

function switchView(name){ 
    $$('.nav-item[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name)); 
    $$('.view').forEach(v=>v.classList.remove('active')); 
    $('#view-'+name).classList.add('active'); 
}

document.addEventListener('DOMContentLoaded',()=>{ 
    applyTheme('dark'); 
    if(window.showDirectoryPicker) $('#fsapiStatus').innerHTML='<span style="color:var(--color-success)">✓ File System Access API is available.</span>'; else $('#fsapiStatus').innerHTML='<span style="color:var(--color-warning)">⚠ File System Access API is not available in this browser.</span>'; 
    if(window.lucide) lucide.createIcons(); 
    $('#themeToggle').onclick=()=>applyTheme(state.theme==='dark'?'light':'dark'); 
    $('#darkModeToggle').onchange=e=>applyTheme(e.target.checked?'dark':'light'); 
    
    $('#openFolderBtn').onclick=openFolder; 
    $('#emptyOpenFolderBtn').onclick=openFolder; 
    $('#settingsOpenBtn').onclick=openFolder; 
    
    $('#newEntryBtn').onclick=()=>{switchView('editor'); clearForm();}; 
    $('#createNewNoteBtn').onclick=()=>{clearForm(); $('#noteTitle').focus();}; 
    
    $('#saveEntryBtn').onclick=saveEntry; 
    
    $('#sidebarToggle').onclick=()=>$('#sidebar').classList.toggle('collapsed'); 
    $('#mobileSidebarToggle').onclick=()=>{$('#sidebar').classList.add('mobile-open'); $('#mobileBackdrop').classList.add('visible');}; 
    $('#mobileBackdrop').onclick=()=>{$('#sidebar').classList.remove('mobile-open'); $('#mobileBackdrop').classList.remove('visible');}; 
    
    $$('.nav-item[data-view]').forEach(b=>b.onclick=()=>{switchView(b.dataset.view); if(b.dataset.view==='browse') renderEntriesList();}); 
    
    $('#noteTitle').addEventListener('input', markUnsaved);
    $('#freeformText').addEventListener('input',()=>{updateWordCount(); markUnsaved();});
    $('#tagInput').addEventListener('keydown',e=>{ 
        if(e.key==='Enter'||e.key===','){ 
            e.preventDefault(); 
            const v=slugTag(e.target.value.trim().replace(/^#/,'')); 
            if(v&&!state.entryTags.includes(v)){state.entryTags.push(v); renderTagChips(); markUnsaved();} 
            e.target.value=''; 
        }
    });

    $('#quickSearch').addEventListener('input',e=>{ state.searchQuery=e.target.value.trim(); state.filterTag=null; renderTagList(); switchView('browse'); renderEntriesList(); }); 
    $('#clearTagFilter').onclick=()=>{ state.filterTag=null; state.searchQuery=''; $('#quickSearch').value=''; renderTagList(); renderEntriesList(); }; 
    $('#refreshBtn').onclick=async()=>{ if(state.dirHandle){ await loadAllEntries(); showToast('Notes reloaded'); } }; 
});