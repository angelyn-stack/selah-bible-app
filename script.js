'use strict';

/**
 * SELAH — A quiet place for Scripture
 * Public Bible text supplied by https://bible-api.com/ (no key required).
 * Reference search is by Bible reference, not global keyword search.
 * Keyword finding searches the currently open chapter only.
 */

const API = 'https://bible-api.com';
const TRANSLATIONS = {
  web: 'WEB', kjv: 'KJV', asv: 'ASV', bbe: 'BBE', darby: 'Darby'
};

// Correct canonical book order and chapter counts, for instant navigation and
// offline metadata fallback. Actual Scripture text ALWAYS comes from the API.
const CANONICAL = [
  ['GEN','Genesis',50],['EXO','Exodus',40],['LEV','Leviticus',27],['NUM','Numbers',36],['DEU','Deuteronomy',34],
  ['JOS','Joshua',24],['JDG','Judges',21],['RUT','Ruth',4],['1SA','1 Samuel',31],['2SA','2 Samuel',24],
  ['1KI','1 Kings',22],['2KI','2 Kings',25],['1CH','1 Chronicles',29],['2CH','2 Chronicles',36],['EZR','Ezra',10],
  ['NEH','Nehemiah',13],['EST','Esther',10],['JOB','Job',42],['PSA','Psalms',150],['PRO','Proverbs',31],
  ['ECC','Ecclesiastes',12],['SNG','Song of Solomon',8],['ISA','Isaiah',66],['JER','Jeremiah',52],
  ['LAM','Lamentations',5],['EZK','Ezekiel',48],['DAN','Daniel',12],['HOS','Hosea',14],['JOL','Joel',3],
  ['AMO','Amos',9],['OBA','Obadiah',1],['JON','Jonah',4],['MIC','Micah',7],['NAM','Nahum',3],
  ['HAB','Habakkuk',3],['ZEP','Zephaniah',3],['HAG','Haggai',2],['ZEC','Zechariah',14],['MAL','Malachi',4],
  ['MAT','Matthew',28],['MRK','Mark',16],['LUK','Luke',24],['JHN','John',21],['ACT','Acts',28],
  ['ROM','Romans',16],['1CO','1 Corinthians',16],['2CO','2 Corinthians',13],['GAL','Galatians',6],
  ['EPH','Ephesians',6],['PHP','Philippians',4],['COL','Colossians',4],['1TH','1 Thessalonians',5],
  ['2TH','2 Thessalonians',3],['1TI','1 Timothy',6],['2TI','2 Timothy',4],['TIT','Titus',3],
  ['PHM','Philemon',1],['HEB','Hebrews',13],['JAS','James',5],['1PE','1 Peter',5],['2PE','2 Peter',3],
  ['1JN','1 John',5],['2JN','2 John',1],['3JN','3 John',1],['JUD','Jude',1],['REV','Revelation',22]
].map(([id,name,chapters],i)=>({id,name,chapters,testament:i<39?'old':'new'}));
const BOOK_BY_ID = new Map(CANONICAL.map(book=>[book.id,book]));
const CHAPTER_CACHE = new Map();
const BOOK_CHAPTERS_CACHE = new Map();
const TODAY_REFERENCES = [
  'Psalm 23:1','John 14:27','Isaiah 41:10','Matthew 11:28','Proverbs 3:5',
  'Philippians 4:6','Psalm 46:10','Romans 8:28','Joshua 1:9','1 Peter 5:7',
  'Psalm 119:105','Lamentations 3:22'
];

const $ = id => document.getElementById(id);
const getPref = (key,fallback) => { try {const v=localStorage.getItem('selah:'+key); return v===null?fallback:JSON.parse(v);} catch {return fallback;} };
const setPref = (key,value) => { try {localStorage.setItem('selah:'+key,JSON.stringify(value));} catch {} };
const validBookId = id => BOOK_BY_ID.has(String(id||'').toUpperCase());
const bookBy = id => BOOK_BY_ID.get(id)||BOOK_BY_ID.get('JHN');
const iconMarkup = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const textTrim = value => String(value||'').replace(/\s+/g,' ').trim();

const previousReading = getPref('lastReading',null);
const state = {
  bookId:validBookId(previousReading?.bookId)?previousReading.bookId:'JHN',
  chapter:Number.isInteger(previousReading?.chapter)?previousReading.chapter:3,
  verse:Number.isInteger(previousReading?.verse)?previousReading.verse:null,
  translation:TRANSLATIONS[getPref('translation','web')]?getPref('translation','web'):'web',
  books:CANONICAL,
  testament:'all', bookFilter:'', view:'read', chapterData:null, selectedVerse:null,
  find:'', saved:loadSaved(), fontSize:clamp(Number(getPref('fontSize',17)),15,23),
  showNumbers:getPref('showNumbers',true)!==false, evening:getPref('evening',false)===true,
  searchContext:null, dailyData:null, loading:false, navigationSerial:0, searchSerial:0
};
state.chapter = clamp(state.chapter,1,bookBy(state.bookId).chapters);

function clamp(v,min,max){return Math.max(min,Math.min(max,Number.isFinite(v)?v:min));}
function loadSaved(){const data=getPref('saved',[]);return Array.isArray(data)?data.filter(x=>x&&validBookId(x.bookId)&&Number.isInteger(x.chapter)&&Number.isInteger(x.verse)&&typeof x.text==='string').slice(0,250):[];}
function bookTestament(id){return bookBy(id).testament;}
function setLoading(isLoading){state.loading=isLoading;[$('bookSelect'),$('chapterSelect'),$('translationSelect')].forEach(el=>{el.disabled=isLoading;});}
function showToast(message){const el=$('toast');el.textContent=message;el.classList.add('is-visible');clearTimeout(showToast.timeout);showToast.timeout=setTimeout(()=>el.classList.remove('is-visible'),3300);}

async function fetchJSON(url,{signal}={}){
  const response=await fetch(url,{headers:{Accept:'application/json'},signal});
  if(response.status===429)throw new Error('Too many requests. Please pause briefly and try again.');
  if(!response.ok)throw new Error(response.status===404?'This passage is not available in the selected translation.':`The Bible service returned error ${response.status}.`);
  const data=await response.json();
  if(data.error)throw new Error(typeof data.error==='string'?data.error:'This passage could not be found.');
  return data;
}

function populateBooks(){
  const select=$('bookSelect');
  const selected=state.bookId;
  select.replaceChildren();
  for(const book of state.books){
    const opt=document.createElement('option'); opt.value=book.id; opt.textContent=book.name; select.append(opt);
  }
  select.value=selected;
  buildSidebar();
}

function buildSidebar(){
  const root=$('booksList');root.replaceChildren();
  const term=state.bookFilter.trim().toLowerCase();
  let groupCount=0;
  for(const testament of ['old','new']){
    if(state.testament!=='all'&&state.testament!==testament)continue;
    const books=state.books.filter(book=>book.testament===testament&&book.name.toLowerCase().includes(term));
    if(!books.length)continue;
    groupCount++;
    const group=document.createElement('section');group.className='books-group';
    const heading=document.createElement('div');heading.className='books-group-title';
    const label=document.createElement('span');label.textContent=testament==='old'?'OLD TESTAMENT':'NEW TESTAMENT';
    const count=document.createElement('span');count.textContent=`${books.length} BOOKS`;heading.append(label,count);group.append(heading);
    for(const book of books){
      const btn=document.createElement('button');btn.type='button';btn.className='book-link'+(book.id===state.bookId?' active':'');btn.textContent=book.name;btn.setAttribute('aria-current',book.id===state.bookId?'page':'false');
      btn.addEventListener('click',()=>{closeSidebar();setView('read');navigateTo(book.id,1,null);});group.append(btn);
    }
    root.append(group);
  }
  if(groupCount===0){const p=document.createElement('p');p.className='sidebar-empty';p.textContent='No books found. Try another name.';root.append(p);}
}
function fillChapterSelect(){
  const select=$('chapterSelect'),book=bookBy(state.bookId);
  const count=BOOK_CHAPTERS_CACHE.get(`${state.translation}/${book.id}`)?.length||book.chapters;
  select.replaceChildren();
  for(let n=1;n<=count;n++){const option=document.createElement('option');option.value=n;option.textContent=`Chapter ${n}`;select.append(option);}
  select.value=String(state.chapter);
}
function fillVerseSelect(){
  const select=$('verseSelect');select.replaceChildren();
  const all=document.createElement('option');all.value='all';all.textContent='All verses';select.append(all);
  for(const verse of state.chapterData?.verses||[]){
    const item=document.createElement('option');item.value=String(verse.verse);item.textContent=`Verse ${verse.verse}`;select.append(item);
  }
  select.value=state.selectedVerse===null?'all':String(state.selectedVerse);
  if(select.selectedIndex<0)select.value='all';
}
function updateReadingMeta(){
  const book=bookBy(state.bookId);
  $('bookSelect').value=state.bookId;
  $('testamentLabel').textContent=book.testament==='old'?'OLD TESTAMENT':'NEW TESTAMENT';
  $('bookBreadcrumb').textContent=book.name.toUpperCase();
  $('chapterTitle').replaceChildren(document.createTextNode(book.name+' '));
  const em=document.createElement('em');em.textContent=state.chapter;$('chapterTitle').append(em);
  const count=BOOK_CHAPTERS_CACHE.get(`${state.translation}/${book.id}`)?.length||book.chapters;
  $('chapterProgress').textContent=`Chapter ${state.chapter} of ${count}`;
  $('chapterDescription').textContent=`${TRANSLATIONS[state.translation]} · Take your time. Read at your own pace.`;
  const atFirst=state.bookId==='GEN'&&state.chapter===1;
  const atLast=state.bookId==='REV'&&state.chapter===22;
  for(const id of ['prevChapterTop','prevChapterBottom'])$(id).disabled=atFirst;
  for(const id of ['nextChapterTop','nextChapterBottom'])$(id).disabled=atLast;
  buildSidebar();
}
async function hydrateBooks(){
  try{
    const data=await fetchJSON(`${API}/data/${state.translation}`);
    if(!Array.isArray(data.books))return;
    const approved=data.books.filter(book=>BOOK_BY_ID.has(book.id));
    if(approved.length<60)return;
    state.books=CANONICAL.filter(book=>approved.some(api=>api.id===book.id)).map(book=>{
      const api=approved.find(item=>item.id===book.id);
      return {...book,name:api?.name||book.name};
    });
    populateBooks();
  }catch{ /* Canonical book list remains available without a network request. */ }
}
async function hydrateBookChapters(bookId,translation,serial){
  const key=`${translation}/${bookId}`;
  if(!BOOK_CHAPTERS_CACHE.has(key)){
    try{
      const data=await fetchJSON(`${API}/data/${translation}/${bookId}`);
      const chapters=Array.isArray(data.chapters)?data.chapters.map(c=>Number(c.chapter)).filter(Number.isInteger):[];
      if(chapters.length)BOOK_CHAPTERS_CACHE.set(key,chapters);
    }catch{ /* Use canonical counts until the API becomes available. */ }
  }
  if(serial===state.navigationSerial){fillChapterSelect();updateReadingMeta();}
}

function chapterURL(translation,bookId,chapter){return `${API}/data/${encodeURIComponent(translation)}/${encodeURIComponent(bookId)}/${chapter}`;}
function pageHash(bookId,chapter,verse,translation){return `#${bookId}.${chapter}.${verse||0}.${translation}`;}
function saveHistory(){
  setPref('lastReading',{bookId:state.bookId,chapter:state.chapter,verse:state.selectedVerse});
  const hash=pageHash(state.bookId,state.chapter,state.selectedVerse,state.translation);
  try{history.replaceState(null,'',hash);}catch{}
}

async function navigateTo(bookId,chapter=1,verse=null,options={}){
  bookId=String(bookId).toUpperCase();
  if(!validBookId(bookId))return showToast('Choose a valid Bible book.');
  const book=bookBy(bookId);
  const validChapter=clamp(Number(chapter),1,book.chapters);
  const serial=++state.navigationSerial;
  state.bookId=bookId;state.chapter=validChapter;
  state.selectedVerse=Number.isInteger(Number(verse))&&Number(verse)>0?Number(verse):null;
  state.chapterData=null;state.find='';$('chapterFind').value='';$('findCount').textContent='';
  if(!options.keepSearch)hideSearch();
  populateBooks();fillChapterSelect();fillVerseSelect();updateReadingMeta();setLoading(true);
  $('readerContent').innerHTML='<div class="chapter-loading"><div class="spinner"></div><span>Opening the Scriptures...</span></div>';
  saveHistory();
  hydrateBookChapters(bookId,state.translation,serial);
  const key=`${state.translation}/${bookId}/${validChapter}`;
  try{
    let data=CHAPTER_CACHE.get(key);
    if(!data){data=await fetchJSON(chapterURL(state.translation,bookId,validChapter));if(!Array.isArray(data.verses))throw new Error('This chapter is not available.');CHAPTER_CACHE.set(key,data);}
    if(serial!==state.navigationSerial)return;
    state.chapterData=data;
    if(state.selectedVerse!==null&&!data.verses.some(v=>v.verse===state.selectedVerse))state.selectedVerse=null;
    renderChapter();fillVerseSelect();saveHistory();
    if(state.selectedVerse!==null)scrollToVerse(state.selectedVerse);
    else if(options.scrollTop)scrollToReader();
  }catch(error){
    if(serial!==state.navigationSerial)return;
    state.chapterData=null;renderReaderError(error?.message||'Could not load this chapter.');
  }finally{if(serial===state.navigationSerial)setLoading(false);}
}
function renderReaderError(message){
  const root=$('readerContent');root.replaceChildren();const card=document.createElement('div');card.className='chapter-error';
  const icon=document.createElement('div');icon.innerHTML=iconMarkup('alert');
  const msg=document.createElement('p');msg.textContent=`${message} Check your connection and try again.`;
  const button=document.createElement('button');button.type='button';button.textContent='Try again';button.addEventListener('click',()=>navigateTo(state.bookId,state.chapter,state.selectedVerse));
  card.append(icon,msg,button);root.append(card);
}
function appendHighlighted(container,text,query){
  const original=textTrim(text);
  if(!query){container.textContent=original;return 0;}
  const source=original.toLocaleLowerCase(),term=query.toLocaleLowerCase();
  let from=0,count=0;
  while(true){const index=source.indexOf(term,from);if(index<0)break;
    container.append(document.createTextNode(original.slice(from,index)));
    const mark=document.createElement('mark');mark.textContent=original.slice(index,index+term.length);container.append(mark);
    count++;from=index+term.length;
  }
  container.append(document.createTextNode(original.slice(from)));
  return count;
}
function renderChapter(){
  const root=$('readerContent');root.replaceChildren();
  root.style.setProperty('--reader-size',state.fontSize+'px');
  root.classList.toggle('hide-verse-numbers',!state.showNumbers);
  const data=state.chapterData;
  if(!data||!Array.isArray(data.verses)||!data.verses.length){root.innerHTML='<div class="chapter-empty">No verses were returned for this chapter.</div>';return;}
  let matches=0;
  const fragment=document.createDocumentFragment();
  for(const verse of data.verses){
    const verseEl=document.createElement('div');verseEl.id=`verse-${verse.verse}`;verseEl.className='verse-row';
    if(state.selectedVerse===verse.verse)verseEl.classList.add('is-selected');
    const line=document.createElement('button');line.type='button';line.className='verse-line';line.setAttribute('aria-label',`Select ${bookBy(state.bookId).name} ${state.chapter}, verse ${verse.verse}`);
    const number=document.createElement('span');number.className='verse-num';number.textContent=verse.verse;
    const text=document.createElement('span');text.className='verse-body';
    const found=appendHighlighted(text,verse.text,state.find);matches+=found;
    if(found)verseEl.classList.add('is-match');
    line.append(number,text);
    line.addEventListener('click',()=>selectVerse(verse.verse));verseEl.append(line);
    if(state.selectedVerse===verse.verse){
      const actions=document.createElement('div');actions.className='verse-actions';
      addAction(actions,'copy','Copy verse',()=>copyVerse(verse));
      addAction(actions,'bookmark',isSaved(verse.verse)?'Saved · Remove':'Save verse',()=>toggleSaved(verse));
      addAction(actions,'share','Share',()=>shareVerse(verse));
      verseEl.append(actions);
    }
    fragment.append(verseEl);
  }
  root.append(fragment);
  $('findCount').textContent=state.find?`${matches} match${matches===1?'':'es'}`:'';
}
function addAction(container,icon,label,callback){
  const button=document.createElement('button');button.type='button';button.className='verse-action';
  if(label.startsWith('Saved'))button.classList.add('is-saved');
  button.innerHTML=iconMarkup(icon);button.append(document.createTextNode(label));button.addEventListener('click',callback);container.append(button);
}
function selectVerse(num){
  state.selectedVerse=state.selectedVerse===num?null:num;
  fillVerseSelect();renderChapter();saveHistory();
}
function scrollToVerse(num){
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const element=$(`verse-${num}`);
    if(element)element.scrollIntoView({behavior:'smooth',block:'center'});
  }));
}
function scrollToReader(){requestAnimationFrame(()=>$('readPanel').scrollIntoView({behavior:'smooth',block:'start'}));}
function relativeChapter(delta){
  const index=CANONICAL.findIndex(book=>book.id===state.bookId);
  let targetBook=CANONICAL[index],targetChapter=state.chapter+delta;
  if(targetChapter<1){if(index===0)return;targetBook=CANONICAL[index-1];targetChapter=targetBook.chapters;}
  else if(targetChapter>targetBook.chapters){if(index===CANONICAL.length-1)return;targetBook=CANONICAL[index+1];targetChapter=1;}
  setView('read');navigateTo(targetBook.id,targetChapter,null,{scrollTop:true});
}

function setView(view){
  state.view=view;
  const saved=view==='saved';$('readPanel').hidden=saved;$('savedPanel').hidden=!saved;
  $('readTab').classList.toggle('active',!saved);$('savedTab').classList.toggle('active',saved);
  $('readTab').setAttribute('aria-selected',String(!saved));$('savedTab').setAttribute('aria-selected',String(saved));
  if(saved)renderSaved();
}
function savedId(bookId,chapter,verse,translation){return `${translation}:${bookId}:${chapter}:${verse}`;}
function isSaved(verse){return state.saved.some(s=>s.id===savedId(state.bookId,state.chapter,verse,state.translation));}
function toggleSaved(verse){
  const id=savedId(state.bookId,state.chapter,verse.verse,state.translation);
  const index=state.saved.findIndex(s=>s.id===id);
  if(index>=0){state.saved.splice(index,1);showToast('Verse removed from your saved collection.');}
  else {state.saved.unshift({id,bookId:state.bookId,bookName:bookBy(state.bookId).name,chapter:state.chapter,verse:verse.verse,translation:state.translation,text:textTrim(verse.text)});showToast('Verse saved on this device.');}
  setPref('saved',state.saved);updateSavedCounters();renderSaved();renderChapter();
}
function updateSavedCounters(){$('savedTabCount').textContent=state.saved.length;}
function renderSaved(){
  const container=$('savedList');container.replaceChildren();updateSavedCounters();
  if(!state.saved.length){
    const empty=document.createElement('div');empty.className='saved-empty';
    empty.innerHTML=`${iconMarkup('bookmark')}<h3>Your collection begins here.</h3><p>While reading a chapter, tap a verse and choose “Save verse” to keep it close.</p>`;
    container.append(empty);return;
  }
  for(const item of state.saved){
    const card=document.createElement('article');card.className='saved-item';
    const top=document.createElement('div');top.className='saved-item-top';
    const title=document.createElement('span');title.className='saved-item-name';title.textContent=`${item.bookName} ${item.chapter}:${item.verse} · ${TRANSLATIONS[item.translation]||item.translation.toUpperCase()}`;top.append(title);card.append(top);
    const p=document.createElement('p');p.textContent=item.text;card.append(p);
    const actions=document.createElement('div');actions.className='saved-actions';
    const addButton=(label,icon,fn)=>{const btn=document.createElement('button');btn.type='button';btn.innerHTML=iconMarkup(icon);btn.append(document.createTextNode(label));btn.addEventListener('click',fn);actions.append(btn);};
    addButton('Open','book-open',()=>{state.translation=item.translation;$('translationSelect').value=item.translation;setPref('translation',item.translation);setView('read');navigateTo(item.bookId,item.chapter,item.verse,{scrollTop:true});});
    addButton('Copy','copy',()=>copyText(`${item.bookName} ${item.chapter}:${item.verse} (${TRANSLATIONS[item.translation]||item.translation})\n${item.text}`));
    addButton('Remove','x',()=>{state.saved=state.saved.filter(s=>s.id!==item.id);setPref('saved',state.saved);renderSaved();if(state.chapterData)renderChapter();showToast('Verse removed.');});
    card.append(actions);container.append(card);
  }
}
async function copyText(text){
  try{
    if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(text);
    else {const input=document.createElement('textarea');input.value=text;input.style.position='fixed';input.style.left='-9999px';document.body.append(input);input.select();const result=document.execCommand('copy');input.remove();if(!result)throw new Error('Copy unavailable');}
    showToast('Copied to clipboard.');
  }catch{showToast('Copy was blocked by your browser. Select and copy the text instead.');}
}
function verseCitation(verse){return `${bookBy(state.bookId).name} ${state.chapter}:${verse.verse} (${TRANSLATIONS[state.translation]})`}
function copyVerse(verse){return copyText(`${verseCitation(verse)}\n${textTrim(verse.text)}`);}
async function shareVerse(verse){
  const url=new URL(window.location.href);url.hash=pageHash(state.bookId,state.chapter,verse.verse,state.translation);
  const text=`${verseCitation(verse)} — ${textTrim(verse.text)}`;
  if(navigator.share){try{await navigator.share({title:verseCitation(verse),text,url:url.toString()});return;}catch(error){if(error?.name==='AbortError')return;}}
  await copyText(`${text}\n${url}`);
}

function hideSearch(){
  $('searchResult').hidden=true;$('searchResultVerses').replaceChildren();$('searchReadContext').hidden=true;state.searchContext=null;
}
function showSearchError(query,message){
  $('searchResult').hidden=false;$('searchResultTitle').textContent='Passage not found';
  $('searchResultMessage').textContent=`“${query}” — ${message} Try a reference like John 3:16 or Psalm 23.`;
  $('searchResultVerses').replaceChildren();$('searchReadContext').hidden=true;
}
async function searchPassage(raw){
  const query=raw.trim().replace(/\s+/g,' ');if(!query)return showToast('Enter a reference, such as John 3:16.');
  const serial=++state.searchSerial;
  $('referenceSubmit').disabled=true;
  $('searchResult').hidden=false;
  $('searchResultTitle').textContent='Looking up your passage...';
  $('searchResultMessage').textContent='Search by Bible reference (for example, Romans 8:28–30).';
  $('searchResultVerses').replaceChildren();$('searchReadContext').hidden=true;
  try{
    // Original free-text reference API; '+' is accepted as a space in a path.
    const reference=encodeURIComponent(query).replace(/%20/g,'+');
    const url=`${API}/${reference}?translation=${encodeURIComponent(state.translation)}&single_chapter_book_matching=indifferent`;
    const data=await fetchJSON(url);
    if(serial!==state.searchSerial)return;
    if(!Array.isArray(data.verses)||data.verses.length===0)throw new Error('No Bible verses match that reference.');
    $('searchResultTitle').textContent=data.reference||query;
    $('searchResultMessage').textContent=`${data.verses.length} verse${data.verses.length===1?'':'s'} found · ${TRANSLATIONS[state.translation]}. To search for a word instead, use “Find in this chapter” below.`;
    const resultRoot=$('searchResultVerses');resultRoot.replaceChildren();
    for(const verse of data.verses.slice(0,120)){
      const line=document.createElement('div');line.className='search-verse';
      const n=document.createElement('span');n.className='number';n.textContent=`${verse.chapter}:${verse.verse}`;
      const body=document.createElement('span');body.textContent=textTrim(verse.text);
      line.append(n,body);resultRoot.append(line);
    }
    if(data.verses.length>120){const extra=document.createElement('p');extra.className='small muted';extra.textContent='Showing the first 120 verses. Narrow your reference for more precise results.';resultRoot.append(extra);}
    const first=data.verses[0];
    if(validBookId(first.book_id)){
      state.searchContext={bookId:first.book_id,chapter:first.chapter,verse:first.verse};
      $('searchReadContext').hidden=false;
    }
  }catch(error){if(serial===state.searchSerial)showSearchError(query,error?.message||'The lookup failed.');}
  finally{if(serial===state.searchSerial)$('referenceSubmit').disabled=false;}
}
async function loadDailyVerse(){
  const today=new Date();
  const index=Math.floor(Date.UTC(today.getFullYear(),today.getMonth(),today.getDate())/86400000)%TODAY_REFERENCES.length;
  const reference=TODAY_REFERENCES[index];
  try{
    const url=`${API}/${encodeURIComponent(reference).replace(/%20/g,'+')}?translation=web`;
    const data=await fetchJSON(url);
    if(!Array.isArray(data.verses)||!data.verses.length)throw new Error('No text');
    const verse=data.verses[0];state.dailyData={bookId:verse.book_id,chapter:verse.chapter,verse:verse.verse};
    $('dailyText').textContent=`“${textTrim(verse.text)}”`;
    $('dailyReference').textContent=(data.reference||reference).toUpperCase()+' · WEB';
    $('dailyOpen').disabled=false;
  }catch{
    $('dailyText').textContent='The daily passage is unavailable right now. Open a chapter to continue reading.';
    $('dailyReference').textContent='CONNECTION NEEDED';
    $('dailyOpen').disabled=true;
  }
}
function closeSidebar(){
  $('bookSidebar').classList.remove('is-open');$('sidebarBackdrop').hidden=true;
  $('openSidebar').setAttribute('aria-expanded','false');document.body.style.overflow='';
}
function openSidebar(){
  $('bookSidebar').classList.add('is-open');$('sidebarBackdrop').hidden=false;
  $('openSidebar').setAttribute('aria-expanded','true');document.body.style.overflow='hidden';
  $('bookFilter').focus();
}
function applyPreferences(){
  document.body.classList.toggle('evening',state.evening);
  $('themeToggle').innerHTML=iconMarkup(state.evening?'sun':'moon');
  $('themeToggle').setAttribute('aria-label',state.evening?'Switch to daytime reading theme':'Switch to evening reading theme');
  $('translationSelect').value=state.translation;
  $('verseNumbersToggle').checked=state.showNumbers;
  document.documentElement.style.setProperty('--reader-size',state.fontSize+'px');
}
function readHash(){
  const match=location.hash.match(/^#([A-Z0-9]{3})\.(\d+)\.(\d+)\.(web|kjv|asv|bbe|darby)$/i);
  if(!match||!validBookId(match[1].toUpperCase()))return;
  state.bookId=match[1].toUpperCase();state.chapter=clamp(Number(match[2]),1,bookBy(state.bookId).chapters);
  state.verse=Number(match[3])||null;state.translation=match[4].toLowerCase();
}
function bind(){
  $('referenceForm').addEventListener('submit',event=>{event.preventDefault();searchPassage($('referenceInput').value);});
  $('dismissSearch').addEventListener('click',hideSearch);
  $('searchReadContext').addEventListener('click',()=>{const next=state.searchContext;if(!next)return;setView('read');navigateTo(next.bookId,next.chapter,next.verse,{keepSearch:true,scrollTop:true});});
  $('bookFilter').addEventListener('input',event=>{state.bookFilter=event.target.value;buildSidebar();});
  document.querySelectorAll('[data-testament]').forEach(button=>button.addEventListener('click',()=>{
    state.testament=button.dataset.testament;
    document.querySelectorAll('[data-testament]').forEach(other=>{other.classList.toggle('active',other===button);other.setAttribute('aria-pressed',String(other===button));});
    buildSidebar();
  }));
  $('bookSelect').addEventListener('change',event=>navigateTo(event.target.value,1,null));
  $('chapterSelect').addEventListener('change',event=>navigateTo(state.bookId,Number(event.target.value),null));
  $('verseSelect').addEventListener('change',event=>{
    const value=event.target.value;
    state.selectedVerse=value==='all'?null:Number(value);renderChapter();saveHistory();
    if(state.selectedVerse!==null)scrollToVerse(state.selectedVerse);
  });
  $('translationSelect').addEventListener('change',event=>{
    const next=event.target.value;if(!TRANSLATIONS[next])return;
    state.translation=next;setPref('translation',next);navigateTo(state.bookId,state.chapter,state.selectedVerse);hydrateBooks();
  });
  $('chapterFind').addEventListener('input',event=>{state.find=event.target.value.trim();if(state.chapterData)renderChapter();});
  for(const id of ['prevChapterTop','prevChapterBottom'])$(id).addEventListener('click',()=>relativeChapter(-1));
  for(const id of ['nextChapterTop','nextChapterBottom'])$(id).addEventListener('click',()=>relativeChapter(1));
  $('readTab').addEventListener('click',()=>setView('read'));
  $('savedTab').addEventListener('click',()=>setView('saved'));
  $('quickSaved').addEventListener('click',()=>setView('saved'));
  $('fontDecrease').addEventListener('click',()=>changeFont(-1));
  $('fontIncrease').addEventListener('click',()=>changeFont(1));
  $('verseNumbersToggle').addEventListener('change',event=>{state.showNumbers=event.target.checked;setPref('showNumbers',state.showNumbers);$('readerContent').classList.toggle('hide-verse-numbers',!state.showNumbers);});
  $('themeToggle').addEventListener('click',()=>{state.evening=!state.evening;setPref('evening',state.evening);applyPreferences();});
  $('dailyOpen').addEventListener('click',()=>{if(!state.dailyData)return;state.translation='web';setPref('translation','web');$('translationSelect').value='web';setView('read');navigateTo(state.dailyData.bookId,state.dailyData.chapter,state.dailyData.verse,{scrollTop:true});});
  $('openSidebar').addEventListener('click',openSidebar);$('closeSidebar').addEventListener('click',closeSidebar);
  $('sidebarBackdrop').addEventListener('click',closeSidebar);
  window.addEventListener('keydown',event=>{if(event.key==='Escape'){closeSidebar();hideSearch();}});
  window.addEventListener('hashchange',()=>{
    const previous=state.bookId+'/'+state.chapter+'/'+state.selectedVerse+'/'+state.translation;
    readHash();
    const next=state.bookId+'/'+state.chapter+'/'+state.verse+'/'+state.translation;
    if(previous!==next){$('translationSelect').value=state.translation;setView('read');navigateTo(state.bookId,state.chapter,state.verse);}
  });
}
function changeFont(delta){
  const next=clamp(state.fontSize+delta,15,23);
  if(next===state.fontSize)return;
  state.fontSize=next;setPref('fontSize',next);
  document.documentElement.style.setProperty('--reader-size',next+'px');
  if(state.chapterData)renderChapter();
  showToast(`Reading size: ${next}px`);
}
function init(){
  readHash();
  bind();applyPreferences();populateBooks();updateSavedCounters();renderSaved();
  const date=new Date();
  $('todayLabel').textContent=new Intl.DateTimeFormat('en',{weekday:'long',month:'long',day:'numeric'}).format(date).toUpperCase();
  $('dailyOpen').disabled=true;
  navigateTo(state.bookId,state.chapter,state.verse);
  hydrateBooks();loadDailyVerse();
}
document.addEventListener('DOMContentLoaded',init);
