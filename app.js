/* CHROMA 35 — local-first, 35mm-inspired PWA. No external libraries or uploads. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const el = Object.fromEntries(['preview','finder','shutter','cameraMessage','flashPop','advanceCurtain','advanceLabel','advanceBtn','galleryBtn','switchBtn','frameCounter','vfFrame','vfFilm','vfMode','vfExp','cameraNote','status','filmSelect','filmSlot','filmName','filmKind','modeAuto','modeManual','exposure','exposureValue','bwFilter','manualAdvance','dateStamp','leaks','damage','sounds','grain','grainValue','galleryModal','galleryGrid','closeGallery','viewerModal','viewerTitle','viewerDetails','viewerImg','backToGallery','toggleOriginal','saveProcessed','saveOriginal','sharePhoto','deletePhoto','toast'].map(id=>[id,$(id)]));
const FILMS = {
 portra:{name:'PORTRA 400',full:'Kodak Portra 400',kind:'COLOR NEGATIVE',iso:400,accent:'#d3ac61',type:'color',contrast:.92,toe:.12,shoulder:.22,sat:.86,grain:.62,shadow:[1.009,1.004,.992],light:[1.015,1.005,.989],matrix:[[1.020,-.008,-.012],[-.009,1.025,-.016],[-.025,.010,1.015]],halo:0},
 trix:{name:'TRI-X 400',full:'Kodak Professional Tri-X 400',kind:'BLACK & WHITE',iso:400,accent:'#e6e1cf',type:'bw',contrast:1.21,toe:.10,shoulder:.12,sat:0,grain:1.5,halo:0},
 velvia:{name:'VELVIA 50',full:'Fujifilm Fujichrome Velvia 50',kind:'COLOR SLIDE',iso:50,accent:'#c22f36',type:'color',contrast:1.27,toe:.07,shoulder:.075,sat:1.33,grain:.27,shadow:[.975,1.005,1.031],light:[1.012,1.010,.986],matrix:[[1.055,-.032,-.023],[-.025,1.090,-.065],[-.024,-.016,1.040]],halo:0},
 hp5:{name:'HP5 PLUS',full:'Ilford HP5 Plus',kind:'BLACK & WHITE',iso:400,accent:'#b5bbb0',type:'bw',contrast:1.03,toe:.17,shoulder:.21,sat:0,grain:1.22,halo:0},
 cinestill:{name:'800T',full:'CineStill 800T',kind:'COLOR NEGATIVE',iso:800,accent:'#d75348',type:'color',contrast:1.10,toe:.12,shoulder:.19,sat:1.05,grain:1.12,shadow:[.927,.986,1.095],light:[1.016,.998,.971],matrix:[[1.048,-.017,-.031],[-.018,1.018,0],[-.018,-.008,1.026]],halo:.82}
};
const KEY='chroma35-settings';
const defaults={film:'portra',mode:'auto',ev:0,bwFilter:'none',manualAdvance:true,dateStamp:false,leaks:false,damage:false,sounds:true,grain:100};
let state={...defaults};try{const saved=JSON.parse(localStorage.getItem(KEY)||'{}');state={...state,...saved};}catch{}
if(!FILMS[state.film])state.film='portra';
let stream=null,video=document.createElement('video'),facing='environment',running=false,painting=false,raf=0,lastFrame=0,hasFrame=false,locked=false,busy=false,shotCount=0,db=null,viewerItem=null,viewerOriginal=false,viewerUrl=null,galleryUrls=[],audio=null,previewSize={w:0,h:0},previewFrame=document.createElement('canvas');
video.autoplay=true;video.muted=true;video.playsInline=true;
const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function persist(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{}}
function say(message){el.status.textContent=message;el.toast.textContent=message;el.toast.classList.add('visible');clearTimeout(say.timer);say.timer=setTimeout(()=>el.toast.classList.remove('visible'),2600);}
function setMessage(message){el.cameraMessage.textContent=message;el.cameraMessage.classList.toggle('hidden',!message);}
function updateUI(){
 const f=FILMS[state.film];el.filmSelect.value=state.film;el.filmName.textContent=f.name;el.filmKind.textContent=`${f.kind} · ISO ${f.iso}`;el.filmSlot.style.setProperty('--film-accent',f.accent);
 el.vfFilm.textContent=f.name;el.vfMode.textContent=state.mode==='auto'?'AUTO':'EV MANUAL';el.vfExp.textContent=`EV ${state.ev>=0?'+':''}${Number(state.ev).toFixed(2)}`;
 el.modeAuto.classList.toggle('active',state.mode==='auto');el.modeManual.classList.toggle('active',state.mode==='manual');el.modeAuto.setAttribute('aria-pressed',String(state.mode==='auto'));el.modeManual.setAttribute('aria-pressed',String(state.mode==='manual'));
 el.exposure.disabled=state.mode==='auto';el.exposure.value=state.ev;el.exposureValue.textContent=`${state.ev>=0?'+':''}${Number(state.ev).toFixed(2)} EV`;
 el.bwFilter.value=state.bwFilter;el.bwFilter.disabled=f.type!=='bw';el.bwFilter.title=f.type!=='bw'?'Applies only to black-and-white films':'';
 for(const id of ['manualAdvance','dateStamp','leaks','damage','sounds'])el[id].checked=state[id];el.grain.value=state.grain;el.grainValue.textContent=`${state.grain}%`;
 const next=shotCount+1;el.frameCounter.textContent=`FRAME ${String(next).padStart(3,'0')}`;el.vfFrame.textContent=`${String(next).padStart(2,'0')} / ∞`;
 el.advanceBtn.disabled=!locked;el.advanceBtn.classList.toggle('selected',locked);
 el.shutter.disabled=busy||locked||!stream;el.cameraNote.textContent=locked?'Shutter cocking required: advance the film before the next exposure.':'Images are processed and stored locally. Original and developed files are saved together.';
 persist();
}
function randGen(seed){let x=seed|0;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};}
function tone(x,c,toe,shoulder){x=clamp(x);const y=1/(1+Math.exp(-5.6*c*(x-.5)));const y0=1/(1+Math.exp(2.8*c));const y1=1/(1+Math.exp(-2.8*c));let t=clamp((y-y0)/(y1-y0));t=(1-toe)*t+toe*Math.pow(t,1.24);return clamp((1-shoulder)*t+shoulder*(1-Math.pow(1-t,1.38)));}
function crop3to2(srcW,srcH){let w=srcW,h=srcH,x=0,y=0;if(w/h>1.5){w=h*1.5;x=(srcW-w)/2;}else{h=w/1.5;y=(srcH-h)/2;}return [x,y,w,h];}
function drawSource(ctx,w,h){if(video.readyState<2)return false;const [sx,sy,sw,sh]=crop3to2(video.videoWidth,video.videoHeight);ctx.drawImage(video,sx,sy,sw,sh,0,0,w,h);return true;}
function addHalation(ctx,w,h,strength){if(!strength)return;const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w/3));c.height=Math.max(1,Math.round(h/3));const cx=c.getContext('2d',{willReadFrequently:true});cx.drawImage(ctx.canvas,0,0,c.width,c.height);const img=cx.getImageData(0,0,c.width,c.height);const d=img.data;for(let i=0;i<d.length;i+=4){const r=d[i]/255,g=d[i+1]/255,b=d[i+2]/255;const bright=Math.max(r,g,b);const mask=Math.pow(clamp((bright-.70)/.30),2)*clamp((r*.55+g*.35+b*.1-.55)*3);d[i]=255;d[i+1]=50;d[i+2]=15;d[i+3]=Math.round(mask*225*strength);}cx.putImageData(img,0,0);
 const blur=Math.max(5,Math.round(w*.009));ctx.save();ctx.globalCompositeOperation='screen';ctx.filter=`blur(${blur}px)`;ctx.drawImage(c,0,0,w,h);ctx.filter='none';ctx.globalAlpha=.28;ctx.drawImage(c,0,0,w,h);ctx.restore();}
function applyFilm(ctx,w,h,opts={}){
 const film=FILMS[opts.film||state.film],preview=!!opts.preview,ev=opts.ev??(state.mode==='manual'?+state.ev:0),filter=opts.filter||state.bwFilter,grainStrength=opts.grain??state.grain,seed=opts.seed||123456;
 const img=ctx.getImageData(0,0,w,h),d=img.data,rng=randGen(seed);const weights={none:[.299,.587,.114],yellow:[.39,.53,.08],orange:[.48,.46,.06],red:[.61,.33,.06],green:[.19,.70,.11]}[filter]||[.299,.587,.114];const gain=Math.pow(2,ev*.7);const grainBase=film.grain*(grainStrength/100)*(preview?.68:1);
 const m=film.matrix;const s=film.shadow,l=film.light;
 for(let i=0;i<d.length;i+=4){let r=clamp(d[i]/255*gain),g=clamp(d[i+1]/255*gain),b=clamp(d[i+2]/255*gain);let lum=.2126*r+.7152*g+.0722*b;
 if(film.type==='bw'){
  let y=clamp(weights[0]*r+weights[1]*g+weights[2]*b);y=tone(y,film.contrast,film.toe,film.shoulder);const noise=(rng()+rng()+rng()-1.5)*grainBase*(.035+.035*(1-y));y=clamp(y+noise);r=g=b=y;
 }else{
  const shadow=clamp(1-lum),hi=lum;
  let rr=r*(s[0]*shadow+l[0]*hi),gg=g*(s[1]*shadow+l[1]*hi),bb=b*(s[2]*shadow+l[2]*hi);
  r=clamp(rr*m[0][0]+gg*m[0][1]+bb*m[0][2]);g=clamp(rr*m[1][0]+gg*m[1][1]+bb*m[1][2]);b=clamp(rr*m[2][0]+gg*m[2][1]+bb*m[2][2]);
  lum=.2126*r+.7152*g+.0722*b;const tm=tone(lum,film.contrast,film.toe,film.shoulder),scale=tm/Math.max(lum,.0001);r=clamp(lum+(r-lum)*film.sat);g=clamp(lum+(g-lum)*film.sat);b=clamp(lum+(b-lum)*film.sat);
  r=clamp(r*scale);g=clamp(g*scale);b=clamp(b*scale);
  const noise=(rng()+rng()+rng()-1.5)*grainBase*(.016+.026*(1-tm));r=clamp(r+noise);g=clamp(g+noise*.96);b=clamp(b+noise*1.03);
 }
 d[i]=Math.round(r*255);d[i+1]=Math.round(g*255);d[i+2]=Math.round(b*255);
 }
 ctx.putImageData(img,0,0);addHalation(ctx,w,h,film.halo);
 // Vignette is optical rather than simulated damage, and intentionally subtle.
 ctx.save();const radius=Math.max(w,h),vg=ctx.createRadialGradient(w*.5,h*.49,Math.min(w,h)*.25,w*.5,h*.49,radius*.67);vg.addColorStop(0,'#00000000');vg.addColorStop(1,film.type==='bw'?'#00000024':'#00000020');ctx.fillStyle=vg;ctx.fillRect(0,0,w,h);ctx.restore();
 if(opts.leaks){ctx.save();ctx.globalCompositeOperation='screen';const side=rng()<.5?0:w;const leak=ctx.createRadialGradient(side,h*.3,0,side,h*.4,w*.66);leak.addColorStop(0,'#ff773a5c');leak.addColorStop(.4,'#ff545027');leak.addColorStop(1,'#ff664000');ctx.fillStyle=leak;ctx.fillRect(0,0,w,h);ctx.restore();}
 if(opts.damage){ctx.save();ctx.globalAlpha=.18;for(let i=0;i<Math.round(w*h/65000);i++){let x=rng()*w,y=rng()*h;ctx.fillStyle=rng()<.5?'#fff':'#000';ctx.fillRect(x,y,1+rng()*2,1+rng()*2);}ctx.strokeStyle='#f7e5cb';ctx.lineWidth=Math.max(.4,w/2500);ctx.globalAlpha=.14;for(let i=0;i<Math.round(w/750);i++){const x=rng()*w;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+(rng()-.5)*w*.03,h);ctx.stroke();}ctx.restore();}
 if(opts.date){const dt=opts.date instanceof Date?opts.date:new Date();const text=`${String(dt.getMonth()+1).padStart(2,'0')} ${String(dt.getDate()).padStart(2,'0')} '${String(dt.getFullYear()).slice(-2)}`;ctx.save();ctx.font=`bold ${Math.max(12,Math.round(w*.023))}px monospace`;ctx.textAlign='right';ctx.textBaseline='bottom';ctx.shadowColor='#000';ctx.shadowBlur=w*.005;ctx.fillStyle='#ffae55';ctx.fillText(text,w*.976,h*.965);ctx.restore();}
}
function previewRender(now){if(!running)return;raf=requestAnimationFrame(previewRender);if(now-lastFrame<120||painting||busy||!video.videoWidth)return;lastFrame=now;painting=true;try{
 const rect=el.finder.getBoundingClientRect(),w=Math.min(850,Math.max(300,Math.round(rect.width))),h=Math.round(w/1.5);
 if(previewSize.w!==w||previewSize.h!==h){previewSize={w,h};el.preview.width=w;el.preview.height=h;previewFrame.width=w;previewFrame.height=h;}
 const p=previewFrame.getContext('2d',{willReadFrequently:true});if(drawSource(p,w,h)){if(facing==='user'){const copy=document.createElement('canvas');copy.width=w;copy.height=h;const c=copy.getContext('2d');c.translate(w,0);c.scale(-1,1);c.drawImage(previewFrame,0,0);p.clearRect(0,0,w,h);p.drawImage(copy,0,0);}applyFilm(p,w,h,{preview:true,seed:93625,leaks:state.leaks,damage:false,date:state.dateStamp,filter:state.bwFilter});el.preview.getContext('2d').drawImage(previewFrame,0,0);hasFrame=true;}
 }catch(e){console.warn('Preview error',e);}finally{painting=false;}}
async function startCamera(){stopCamera();setMessage('Requesting camera access…');if(!navigator.mediaDevices?.getUserMedia){setMessage('Camera requires HTTPS or localhost, and a browser with camera support.');say('Camera API unavailable. Use HTTPS.');return;}
 try{stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facing},width:{ideal:2560},height:{ideal:1706},aspectRatio:{ideal:1.5}}});video.srcObject=stream;await video.play();setMessage('');running=true;hasFrame=false;raf=requestAnimationFrame(previewRender);say('Camera ready');}catch(e){setMessage(`Camera unavailable (${e.name||'error'}). Check browser permissions and HTTPS.`);say('Camera could not start');}updateUI();}
function stopCamera(){running=false;cancelAnimationFrame(raf);if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}video.srcObject=null;}
function audioContext(){if(!state.sounds)return null;try{audio??=new(window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();return audio;}catch{return null;}}
function clickSound(wind=false){const a=audioContext();if(!a)return;const t=a.currentTime,osc=a.createOscillator(),gain=a.createGain();osc.type=wind?'sawtooth':'square';osc.frequency.setValueAtTime(wind?90:240,t);osc.frequency.exponentialRampToValueAtTime(wind?35:55,t+(wind?.13:.045));gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(wind?.055:.11,t+.005);gain.gain.exponentialRampToValueAtTime(.0001,t+(wind?.14:.065));osc.connect(gain).connect(a.destination);osc.start(t);osc.stop(t+(wind?.15:.07));}
function haptic(pattern){try{navigator.vibrate?.(pattern);}catch{}}
function blobOf(canvas,quality=.93){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not encode image')),'image/jpeg',quality));}
async function wind(){el.advanceCurtain.classList.remove('manual');el.advanceLabel.textContent='ADVANCING FILM';el.advanceCurtain.classList.add('show');clickSound(true);haptic(18);await sleep(450);el.advanceCurtain.classList.remove('show');}
async function advance(){if(!locked||busy)return;clickSound(true);haptic([20,30,20]);el.advanceCurtain.classList.remove('manual');el.advanceLabel.textContent='COCKING SHUTTER';el.advanceCurtain.classList.add('show');await sleep(340);el.advanceCurtain.classList.remove('show');locked=false;updateUI();}
async function capture(){if(busy||locked||!stream||!hasFrame)return;busy=true;updateUI();try{
 clickSound();haptic([14,12,24]);el.flashPop.style.opacity='1';setTimeout(()=>el.flashPop.style.opacity='0',65);
 const maxW=2880,sourceW=video.videoWidth,sourceH=video.videoHeight,[sx,sy,sw,sh]=crop3to2(sourceW,sourceH);let w=Math.min(maxW,Math.max(600,Math.round(sw))),h=Math.round(w/1.5);if(!sourceW||!sourceH)throw Error('No camera frame available');
 const raw=document.createElement('canvas');raw.width=w;raw.height=h;const ctx=raw.getContext('2d',{willReadFrequently:true});ctx.drawImage(video,sx,sy,sw,sh,0,0,w,h);
 if(facing==='user'){// Match the preview and conventional selfie-camera mirror behavior.
 const mirrored=document.createElement('canvas');mirrored.width=w;mirrored.height=h;const mc=mirrored.getContext('2d');mc.translate(w,0);mc.scale(-1,1);mc.drawImage(raw,0,0);ctx.clearRect(0,0,w,h);ctx.drawImage(mirrored,0,0);
 }
 const original=await blobOf(raw,.95);const processed=document.createElement('canvas');processed.width=w;processed.height=h;const pc=processed.getContext('2d',{willReadFrequently:true});pc.drawImage(raw,0,0);const time=Date.now();
 applyFilm(pc,w,h,{film:state.film,ev:state.mode==='manual'?Number(state.ev):0,grain:state.grain,filter:state.bwFilter,leaks:state.leaks,damage:state.damage,date:state.dateStamp?new Date(time):null,seed:(time^w^h)|0});
 const blob=await blobOf(processed,.94),count=++shotCount,item={ts:time,counter:count,blob,original,film:state.film,filmName:FILMS[state.film].full,w,h,ev:state.mode==='manual'?Number(state.ev):0,settings:{...state}};
 if(!db)throw Error('Photo database unavailable');await dbAdd(item);say(`Exposure ${String(count).padStart(3,'0')} · ${FILMS[state.film].name} saved`);
 if(state.manualAdvance){locked=true;el.advanceCurtain.classList.add('manual');el.advanceLabel.textContent='ADVANCE FILM TO CONTINUE';el.advanceCurtain.classList.add('show');await sleep(500);el.advanceCurtain.classList.remove('show');}else await wind();
 }catch(e){console.error(e);say(`Save failed: ${e.message}. Check available storage.`);}finally{busy=false;updateUI();}}
// Upgrade the previous retroPS database in place. Old images remain accessible; old photos have no untouched original.
function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open('retroPS',2);req.onupgradeneeded=()=>{const db=req.result;let store;if(!db.objectStoreNames.contains('photos'))store=db.createObjectStore('photos',{keyPath:'id',autoIncrement:true});else store=req.transaction.objectStore('photos');if(!store.indexNames.contains('ts'))store.createIndex('ts','ts');};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function request(action,mode='readonly'){return new Promise((resolve,reject)=>{const tx=db.transaction('photos',mode),req=action(tx.objectStore('photos'));req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);tx.onabort=()=>reject(tx.error||Error('Storage transaction aborted'));});}
const dbAdd=item=>request(s=>s.add(item),'readwrite');const dbAll=()=>request(s=>s.getAll());const dbRemove=id=>request(s=>s.delete(id),'readwrite');
function releaseGalleryURLs(){galleryUrls.forEach(url=>URL.revokeObjectURL(url));galleryUrls=[];}
async function gallery(){el.galleryModal.classList.add('open');el.galleryGrid.replaceChildren();try{const items=await dbAll();items.sort((a,b)=>b.ts-a.ts);releaseGalleryURLs();if(!items.length){const p=document.createElement('div');p.className='empty';p.textContent='No exposures yet. Load a film stock and release the shutter.';el.galleryGrid.appendChild(p);}for(const item of items){const url=URL.createObjectURL(item.blob);galleryUrls.push(url);const btn=document.createElement('button');btn.className='photo-card';const img=document.createElement('img');img.src=url;img.alt=`Exposure ${item.counter}, ${item.filmName||'legacy film look'}`;img.loading='lazy';const info=document.createElement('div');info.className='photo-details';info.textContent=`#${String(item.counter).padStart(3,'0')} · ${item.filmName||'RETRO P&S (LEGACY)'}`;const sm=document.createElement('small');sm.textContent=new Date(item.ts).toLocaleString();info.append(sm);btn.append(img,info);btn.addEventListener('click',()=>viewPhoto(item));el.galleryGrid.append(btn);}}catch(e){say('Unable to open contact sheet: '+e.message);}}
function viewPhoto(item){viewerItem=item;viewerOriginal=false;el.viewerTitle.textContent=`EXPOSURE ${String(item.counter).padStart(3,'0')}`;el.viewerDetails.textContent=`${item.filmName||'Legacy photograph'} · ${new Date(item.ts).toLocaleString()} · ${item.w||'?'} × ${item.h||'?'} px`;el.saveOriginal.disabled=!item.original;el.toggleOriginal.disabled=!item.original;el.viewerModal.classList.add('open');showViewerImage();}
function showViewerImage(){if(viewerUrl)URL.revokeObjectURL(viewerUrl);viewerUrl=URL.createObjectURL(viewerOriginal&&viewerItem.original?viewerItem.original:viewerItem.blob);el.viewerImg.src=viewerUrl;el.toggleOriginal.textContent=viewerOriginal?'SHOW DEVELOPED':'SHOW ORIGINAL';}
function closeViewer(){el.viewerModal.classList.remove('open');el.viewerImg.removeAttribute('src');if(viewerUrl){URL.revokeObjectURL(viewerUrl);viewerUrl=null;}viewerItem=null;}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function filename(item,original){const date=new Date(item.ts).toISOString().replace(/[:.]/g,'-');return `CHROMA35_${item.film||'legacy'}_${String(item.counter).padStart(3,'0')}_${date}${original?'_ORIGINAL':'_DEVELOPED'}.jpg`;}
async function share(){if(!viewerItem)return;const file=new File([viewerItem.blob],filename(viewerItem,false),{type:'image/jpeg'});try{if(navigator.share&&navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:'CHROMA 35'});else downloadBlob(viewerItem.blob,file.name);}catch(e){if(e.name!=='AbortError')say('Share unavailable; try Save Developed.');}}
async function deleteViewed(){if(!viewerItem||!confirm('Permanently delete this exposure and its original?'))return;try{await dbRemove(viewerItem.id);closeViewer();await gallery();say('Exposure deleted');}catch(e){say('Delete failed: '+e.message);}}
function bind(){el.shutter.addEventListener('click',capture);el.advanceBtn.addEventListener('click',advance);el.switchBtn.addEventListener('click',async()=>{facing=facing==='environment'?'user':'environment';say('Switching camera…');await startCamera();});el.filmSelect.addEventListener('change',()=>{state.film=el.filmSelect.value;updateUI();say(`Loaded ${FILMS[state.film].full}`);});
 el.modeAuto.addEventListener('click',()=>{state.mode='auto';state.ev=0;updateUI();});el.modeManual.addEventListener('click',()=>{state.mode='manual';updateUI();});
 el.exposure.addEventListener('input',()=>{state.ev=+el.exposure.value;updateUI();});el.grain.addEventListener('input',()=>{state.grain=+el.grain.value;updateUI();});el.bwFilter.addEventListener('change',()=>{state.bwFilter=el.bwFilter.value;updateUI();});
 for(const id of ['manualAdvance','dateStamp','leaks','damage','sounds'])el[id].addEventListener('change',()=>{state[id]=el[id].checked;if(id==='manualAdvance'&&!state.manualAdvance&&locked)locked=false;updateUI();});
 el.galleryBtn.addEventListener('click',gallery);el.closeGallery.addEventListener('click',()=>{el.galleryModal.classList.remove('open');releaseGalleryURLs();});el.backToGallery.addEventListener('click',closeViewer);
 el.toggleOriginal.addEventListener('click',()=>{if(!viewerItem?.original)return;viewerOriginal=!viewerOriginal;showViewerImage();});
 el.saveProcessed.addEventListener('click',()=>{if(viewerItem)downloadBlob(viewerItem.blob,filename(viewerItem,false));});el.saveOriginal.addEventListener('click',()=>{if(viewerItem?.original)downloadBlob(viewerItem.original,filename(viewerItem,true));});el.sharePhoto.addEventListener('click',share);el.deletePhoto.addEventListener('click',deleteViewed);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(el.viewerModal.classList.contains('open'))closeViewer();else if(el.galleryModal.classList.contains('open')){el.galleryModal.classList.remove('open');releaseGalleryURLs();}}else if((e.key===' '||e.key==='Enter')&&!el.viewerModal.classList.contains('open')&&!el.galleryModal.classList.contains('open')&&e.target===document.body){e.preventDefault();capture();}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){running=false;cancelAnimationFrame(raf);}else if(stream){running=true;raf=requestAnimationFrame(previewRender);}});
 window.addEventListener('pagehide',stopCamera);
}
async function boot(){bind();updateUI();try{db=await openDB();const items=await dbAll();shotCount=items.reduce((n,p)=>Math.max(n,Number(p.counter)||0),0);}catch(e){console.error(e);say('Local gallery storage unavailable. Photos cannot be saved.');}updateUI();await startCamera();if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(e=>console.warn('Offline install unavailable',e)));}
boot();
})();
