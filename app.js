// Service Worker
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(function(){});
window.addEventListener('online',function(){var b=document.querySelector('.offline-badge');if(b)b.classList.remove('show')});
window.addEventListener('offline',function(){var b=document.querySelector('.offline-badge');if(b)b.classList.add('show')});

// Storage
var LS={get:function(k,fb){try{var v=localStorage.getItem('barchg3_'+k);return v?JSON.parse(v):fb}catch(e){return fb}},set:function(k,v){try{localStorage.setItem('barchg3_'+k,JSON.stringify(v))}catch(e){}}};

// Default products
var DEFAULT_PRODUCTS=[
  {id:'1',name:'Caf\u00e9',prixVente:.5,source:'foyer',prixFoyer:.4,packPrix:0,packQte:1,stock:100,category:'Boissons'},
  {id:'2',name:'Coca-Cola',prixVente:1,source:'foyer',prixFoyer:.8,packPrix:0,packQte:1,stock:36,category:'Boissons'},
  {id:'3',name:'Eau',prixVente:.5,source:'foyer',prixFoyer:.4,packPrix:0,packQte:1,stock:48,category:'Boissons'},
  {id:'4',name:'Bi\u00e8re pression',prixVente:1.5,source:'foyer',prixFoyer:1.2,packPrix:0,packQte:1,stock:48,category:'Boissons'},
  {id:'5',name:'Perrier',prixVente:.8,source:'propre',prixFoyer:0,packPrix:13.25,packQte:24,stock:24,category:'Boissons'},
  {id:'6',name:'Chips',prixVente:1,source:'propre',prixFoyer:0,packPrix:8,packQte:12,stock:20,category:'Snacks'},
  {id:'7',name:'Bonbons',prixVente:.5,source:'propre',prixFoyer:0,packPrix:5,packQte:20,stock:30,category:'Confiserie'},
  {id:'8',name:'Barre chocolat',prixVente:1,source:'propre',prixFoyer:0,packPrix:12,packQte:24,stock:15,category:'Confiserie'}
];

// Price split helpers
function getPartOff(p){return p.source==='foyer'?(p.prixFoyer||0):0}
function getPartNoire(p){return p.source==='foyer'?(p.prixVente-(p.prixFoyer||0)):p.prixVente}
function getCoutUnit(p){return p.source==='propre'&&p.packQte>0?(p.packPrix/p.packQte):0}
function getBenefice(p){return p.source==='propre'?(p.prixVente-getCoutUnit(p)):getPartNoire(p)}

// State
var state={
  tab:'Caisse',products:LS.get('products',DEFAULT_PRODUCTS),transactions:LS.get('tx',[]),
  credits:LS.get('credits',[]),caisseOff:LS.get('caisseOff',0),caisseNoire:LS.get('caisseNoire',0),
  closings:LS.get('closings',[]),cart:[],modal:null,filterMode:'all',filterPeriod:'all',
  selectedDay:'',selectedMonth:'',creditName:'',closerName:'',closerPassword:'',formError:'',
  payAmount:'',selectedCredit:null,
  prodForm:{name:'',prixVente:'',source:'foyer',prixFoyer:'',packPrix:'',packQte:'',stock:'',category:'Boissons'},
  editProductId:null,actionClosing:null,actionPassword:'',actionError:'',actionNote:'',viewClosing:null
};

function persist(){LS.set('products',state.products);LS.set('tx',state.transactions);LS.set('credits',state.credits);LS.set('caisseOff',state.caisseOff);LS.set('caisseNoire',state.caisseNoire);LS.set('closings',state.closings)}
function update(c){for(var k in c)state[k]=c[k];persist();render()}

// Utilities
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function fmt(n){return Number(n).toFixed(2).replace('.',',')+' \u20ac'}
function dateStr(ts){var d=new Date(ts);return d.toLocaleDateString('fr-FR')+' '+d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}
function dayKey(ts){return new Date(ts).toLocaleDateString('fr-FR')}
function monthKey(ts){var d=new Date(ts);return String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear()}
function esc(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML}
function simpleHash(str){var h=0;for(var i=0;i<str.length;i++){h=((h<<5)-h)+str.charCodeAt(i);h=h&h}return h.toString(36)}
function uniq(arr){return Array.from(new Set(arr))}

var TABS=[{id:'Caisse',icon:'\uD83D\uDED2'},{id:'Ardoises',icon:'\uD83D\uDCCB'},{id:'Stock',icon:'\uD83D\uDCE6'},{id:'Admin',icon:'\u2699\uFE0F'},{id:'Historique',icon:'\uD83D\uDCDC'},{id:'Compta',icon:'\uD83D\uDCCA'},{id:'Cl\u00f4ture',icon:'\uD83D\uDD12'}];

function closeModal(){update({modal:null,formError:'',actionClosing:null,actionError:'',viewClosing:null})}
function modalHTML(title,body,wide){return '<div class="overlay" onclick="if(event.target===this)closeModal()"><div class="modal '+(wide?'wide':'')+'"><div class="modal-header"><span>'+esc(title)+'</span><button class="modal-close" onclick="closeModal()">\u2715</button></div><div class="modal-body">'+body+'</div></div></div>'}

// ====== CAISSE ======
function renderCaisse(){
  var cats=uniq(state.products.map(function(p){return p.category}));
  var cartPartOff=state.cart.reduce(function(s,c){return s+getPartOff(c)*c.qty},0);
  var cartPartNoire=state.cart.reduce(function(s,c){return s+getPartNoire(c)*c.qty},0);
  var cartTotal=cartPartOff+cartPartNoire;
  var pH='';
  cats.forEach(function(cat){
    pH+='<div class="cat-label">'+esc(cat)+'</div><div class="product-grid">';
    state.products.filter(function(p){return p.category===cat}).forEach(function(p){
      var pOff=getPartOff(p),pNoire=getPartNoire(p);
      var bc=p.source==='propre'?'var(--purple)':'var(--green)';
      pH+='<button class="product-btn '+(p.stock<=0?'oos':'')+'" style="border-left:4px solid '+bc+'" onclick="addToCart(\''+p.id+'\')" '+(p.stock<=0?'disabled':'')+'><div class="pname">'+esc(p.name)+'</div><div class="pprice">'+fmt(p.prixVente)+'</div><div class="psplit">'+(pOff>0?'<span style="color:#86efac">'+fmt(pOff)+'</span> + ':'')+'<span style="color:var(--purple3)">'+fmt(pNoire)+'</span></div><div class="pstock">Stock: '+p.stock+'</div></button>';
    });pH+='</div>';
  });
  var cartH='';
  if(!state.cart.length)cartH='<div class="cart-empty">Aucun article</div>';
  else state.cart.forEach(function(c){
    var pOff=getPartOff(c),pNoire=getPartNoire(c);
    cartH+='<div class="cart-item"><div style="flex:1"><div style="font-weight:600;font-size:13px">'+esc(c.name)+'</div><div style="font-size:10px;color:var(--text3)">'+fmt(c.prixVente)+' \u00d7 '+c.qty+(pOff>0?' \u00b7 <span style="color:#86efac">off '+fmt(pOff*c.qty)+'</span>':'')+' \u00b7 <span style="color:var(--purple3)">noire '+fmt(pNoire*c.qty)+'</span></div></div><div style="font-weight:700;margin-right:6px;font-size:13px">'+fmt(c.prixVente*c.qty)+'</div><div style="display:flex;gap:3px"><button class="qty-btn" onclick="removeFromCart(\''+c.id+'\')">\u2212</button><button class="qty-btn" onclick="addToCart(\''+c.id+'\')">+</button></div></div>';
  });
  var split='';
  if(state.cart.length){
    split='<div style="border-top:1px solid var(--bg3);padding-top:6px;margin-bottom:4px">';
    if(cartPartOff>0)split+='<div style="font-size:12px;display:flex;justify-content:space-between;color:#86efac"><span>\u2192 Officielle</span><span>'+fmt(cartPartOff)+'</span></div>';
    split+='<div style="font-size:12px;display:flex;justify-content:space-between;color:var(--purple3)"><span>\u2192 Noire</span><span>'+fmt(cartPartNoire)+'</span></div></div>';
  }
  return '<div class="caisse-grid"><div class="product-section">'+pH+'</div><div class="cart-section"><div class="cart-title">Panier</div><div class="cart-items">'+cartH+'</div>'+split+'<div class="cart-total">Total : '+fmt(cartTotal)+'</div><div class="cart-btns"><button class="btn" style="background:var(--green2)" onclick="doCheckout(\'cash\')" '+(!state.cart.length?'disabled':'')+'>\uD83D\uDCB0 Encaisser</button><button class="btn" style="background:var(--yellow2)" onclick="update({modal:\'credit\'})" '+(!state.cart.length?'disabled':'')+'>\uD83D\uDCCB Ardoise</button></div></div></div>';
}

window.addToCart=function(id){var p=state.products.find(function(x){return x.id===id});if(!p||p.stock<=0)return;var ex=state.cart.find(function(c){return c.id===id});if(ex){if(ex.qty>=p.stock)return;state.cart=state.cart.map(function(c){return c.id===id?Object.assign({},c,{qty:c.qty+1}):c})}else state.cart=state.cart.concat([Object.assign({},p,{qty:1})]);render()};
window.removeFromCart=function(id){state.cart=state.cart.map(function(c){return c.id===id?Object.assign({},c,{qty:c.qty-1}):c}).filter(function(c){return c.qty>0});render()};

window.doCheckout=function(mode,name){
  if(!state.cart.length)return;
  var totalOff=state.cart.reduce(function(s,c){return s+getPartOff(c)*c.qty},0);
  var totalNoire=state.cart.reduce(function(s,c){return s+getPartNoire(c)*c.qty},0);
  var total=totalOff+totalNoire;
  var tx={id:uid(),items:state.cart.map(function(c){return{name:c.name,qty:c.qty,prixVente:c.prixVente,partOff:getPartOff(c),partNoire:getPartNoire(c),source:c.source}}),total:total,totalOff:totalOff,totalNoire:totalNoire,date:Date.now(),mode:mode,creditName:name||null};
  state.products=state.products.map(function(p){var ic=state.cart.find(function(c){return c.id===p.id});return ic?Object.assign({},p,{stock:Math.max(0,p.stock-ic.qty)}):p});
  if(mode==='cash'){state.caisseOff+=totalOff;state.caisseNoire+=totalNoire}
  state.transactions=[tx].concat(state.transactions);
  if(mode==='credit'){
    var entry={date:Date.now(),amount:total,amountOff:totalOff,amountNoire:totalNoire,items:state.cart.map(function(c){return c.name+' x'+c.qty}).join(', ')};
    var ex=state.credits.find(function(c){return c.name.toLowerCase()===name.toLowerCase()});
    if(ex)state.credits=state.credits.map(function(c){return c.name.toLowerCase()===name.toLowerCase()?Object.assign({},c,{amount:c.amount+total,amountOff:(c.amountOff||0)+totalOff,amountNoire:(c.amountNoire||0)+totalNoire,history:(c.history||[]).concat([entry])}):c});
    else state.credits=state.credits.concat([{id:uid(),name:name,amount:total,amountOff:totalOff,amountNoire:totalNoire,history:[entry]}]);
  }
  state.cart=[];update({modal:null,creditName:''});
};
window.confirmCredit=function(){var n=state.creditName.trim();if(!n)return;doCheckout('credit',n)};

// ====== ARDOISES ======
function renderArdoises(){
  var total=state.credits.reduce(function(s,c){return s+c.amount},0);
  var cards='';
  if(!state.credits.length)cards='<div class="empty">Aucune ardoise \uD83C\uDF89</div>';
  else state.credits.forEach(function(c){
    var hist='';
    if(c.history&&c.history.length){hist='<div style="margin-top:6px;max-height:80px;overflow-y:auto">';c.history.slice(-5).forEach(function(h){hist+='<div style="font-size:10px;color:var(--text2);border-top:1px solid var(--bg3);padding-top:2px;margin-top:2px">'+dateStr(h.date)+' \u2014 '+(h.amount>0?'+':'')+fmt(h.amount)+' \u2014 '+esc(h.items)+'</div>'});hist+='</div>'}
    cards+='<div class="credit-card"><div style="display:flex;justify-content:space-between;align-items:center"><div style="font-size:17px;font-weight:700">'+esc(c.name)+'</div><div style="font-size:19px;font-weight:800;color:var(--red)">'+fmt(c.amount)+'</div></div><div style="font-size:11px;color:var(--text3);margin-top:3px">Off: '+fmt(c.amountOff||0)+' \u00b7 Noire: '+fmt(c.amountNoire||0)+'</div>'+hist+'<button class="btn-sm mt-8" style="background:var(--green2)" onclick="selectCredit(\''+c.id+'\')">Encaisser</button></div>';
  });
  return '<div class="p-16"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px" class="mb-14"><h2 class="section-title">Ardoises</h2><span class="badge" style="background:#ef444422;border:1px solid #ef444455;color:var(--red)">Total d\u00fb : '+fmt(total)+'</span></div><div class="grid-cards">'+cards+'</div></div>';
}
window.selectCredit=function(id){state.selectedCredit=state.credits.find(function(x){return x.id===id});state.payAmount='';update({modal:'payCredit'})};
window.payOffCredit=function(){
  var c=state.selectedCredit;if(!c)return;
  var amount=state.payAmount?parseFloat(state.payAmount.replace(',','.')):c.amount;
  if(isNaN(amount)||amount<=0)return;var actual=Math.min(amount,c.amount);
  var ratio=c.amount>0?actual/c.amount:1;var pOff=(c.amountOff||0)*ratio;var pNoire=(c.amountNoire||0)*ratio;
  state.credits=state.credits.map(function(x){return x.id===c.id?Object.assign({},x,{amount:x.amount-actual,amountOff:(x.amountOff||0)-pOff,amountNoire:(x.amountNoire||0)-pNoire,history:(x.history||[]).concat([{date:Date.now(),amount:-actual,items:'Remboursement'}])}):x}).filter(function(x){return x.amount>0.005});
  state.caisseOff+=pOff;state.caisseNoire+=pNoire;
  state.transactions=[{id:uid(),items:[{name:'Remboursement '+c.name,qty:1,prixVente:actual,partOff:pOff,partNoire:pNoire,source:'mixte'}],total:actual,totalOff:pOff,totalNoire:pNoire,date:Date.now(),mode:'remboursement'}].concat(state.transactions);
  update({modal:null,selectedCredit:null,payAmount:''});
};

// ====== STOCK ======
function renderStock(){
  var cats=uniq(state.products.map(function(p){return p.category}));var html='';
  cats.forEach(function(cat){
    html+='<div class="cat-label">'+esc(cat)+'</div><div class="stock-table"><div class="stock-header"><span style="flex:2">Produit</span><span style="flex:1;text-align:center">Stock</span><span style="flex:2;text-align:center">Actions</span></div>';
    state.products.filter(function(p){return p.category===cat}).forEach(function(p){
      html+='<div class="stock-row '+(p.stock<=5?'low':'')+'"><span style="flex:2;font-weight:600">'+esc(p.name)+(p.stock<=5?' \u26A0\uFE0F':'')+'</span><span style="flex:1;text-align:center;font-weight:700;color:'+(p.stock<=5?'var(--red)':'var(--green)')+'">'+p.stock+'</span><span style="flex:2;display:flex;gap:3px;justify-content:center;flex-wrap:wrap"><button class="btn-xs" style="background:var(--blue2)" onclick="restockProduct(\''+p.id+'\',6)">+6</button><button class="btn-xs" style="background:var(--blue2)" onclick="restockProduct(\''+p.id+'\',24)">+24</button><button class="btn-xs" style="background:#6b7280" onclick="editProduct(\''+p.id+'\')">\u270F\uFE0F</button><button class="btn-xs" style="background:var(--red2)" onclick="deleteProduct(\''+p.id+'\')">\uD83D\uDDD1</button></span></div>';
    });html+='</div><div style="margin-bottom:14px"></div>';
  });
  return '<div class="p-16"><div style="display:flex;justify-content:space-between;align-items:center" class="mb-14"><h2 class="section-title">Stock</h2><button class="btn-sm" style="background:var(--blue2);padding:9px 16px" onclick="openProdForm()">+ Ajouter</button></div>'+html+'</div>';
}
window.restockProduct=function(id,qty){state.products=state.products.map(function(p){return p.id===id?Object.assign({},p,{stock:p.stock+qty}):p});update({})};
window.deleteProduct=function(id){state.products=state.products.filter(function(p){return p.id!==id});update({})};
window.editProduct=function(id){var p=state.products.find(function(x){return x.id===id});state.editProductId=id;state.prodForm={name:p.name,prixVente:p.prixVente+'',source:p.source,prixFoyer:(p.prixFoyer||0)+'',packPrix:(p.packPrix||0)+'',packQte:(p.packQte||1)+'',stock:p.stock+'',category:p.category};update({modal:'prodForm'})};
window.openProdForm=function(){state.editProductId=null;state.prodForm={name:'',prixVente:'',source:'foyer',prixFoyer:'',packPrix:'',packQte:'',stock:'',category:'Boissons'};update({modal:'prodForm'})};
window.saveProduct=function(){
  var f=state.prodForm;
  var p={name:f.name.trim(),prixVente:parseFloat(f.prixVente.toString().replace(',','.')),source:f.source,prixFoyer:parseFloat((f.prixFoyer||'0').toString().replace(',','.')),packPrix:parseFloat((f.packPrix||'0').toString().replace(',','.')),packQte:parseInt(f.packQte)||1,stock:parseInt(f.stock),category:f.category.trim()||'Boissons'};
  if(!p.name||isNaN(p.prixVente)||isNaN(p.stock))return;
  if(p.source==='foyer'){p.packPrix=0;p.packQte=1}
  if(p.source==='propre'){p.prixFoyer=0}
  if(state.editProductId)state.products=state.products.map(function(pr){return pr.id===state.editProductId?Object.assign({},pr,p):pr});
  else state.products=state.products.concat([Object.assign({},p,{id:uid()})]);
  state.editProductId=null;update({modal:null});
};
window.setProdField=function(k,v){state.prodForm[k]=v;if(k==='source')render()};

// ====== ADMIN ======
function renderAdmin(){
  var rows='';
  state.products.forEach(function(p){
    var pOff=getPartOff(p),pNoire=getPartNoire(p),cu=getCoutUnit(p),benef=getBenefice(p);
    var src=p.source==='foyer'?'<span style="color:#86efac">Foyer</span>':'<span style="color:var(--purple3)">Achat propre</span>';
    var details='';
    if(p.source==='foyer') details='<div class="info-row"><span>Prix foyer</span><span style="color:#86efac">'+fmt(p.prixFoyer||0)+'</span></div><div class="info-row"><span>Marge \u2192 noire</span><span style="color:var(--purple3)">'+fmt(pNoire)+'</span></div>';
    else details='<div class="info-row"><span>Co\u00fbt du pack</span><span>'+fmt(p.packPrix)+' / '+p.packQte+' unit\u00e9s</span></div><div class="info-row"><span>Co\u00fbt unitaire</span><span style="color:var(--yellow)">'+fmt(cu)+'</span></div><div class="info-row"><span>B\u00e9n\u00e9fice / unit\u00e9</span><span style="color:'+(benef>=0?'var(--green)':'var(--red)')+'">'+fmt(benef)+'</span></div>';
    rows+='<div class="credit-card mb-8"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><div><div style="font-weight:700;font-size:15px">'+esc(p.name)+'</div><div style="font-size:11px;margin-top:2px">'+src+' \u00b7 '+esc(p.category)+'</div></div><div style="font-size:18px;font-weight:800;color:var(--blue3)">'+fmt(p.prixVente)+'</div></div>'+details+'<div class="info-row" style="border-top:1px solid var(--bg3);padding-top:6px;margin-top:4px;font-weight:700"><span>Par vente</span><span><span style="color:#86efac">'+fmt(pOff)+'</span> off + <span style="color:var(--purple3)">'+fmt(pNoire)+'</span> noire</span></div><button class="btn-sm mt-6" style="background:#6b7280" onclick="editProduct(\''+p.id+'\')">\u270F\uFE0F Modifier</button></div>';
  });
  return '<div class="p-16"><div style="display:flex;justify-content:space-between;align-items:center" class="mb-14"><h2 class="section-title">\u2699\uFE0F Tarifs & co\u00fbts</h2><button class="btn-sm" style="background:var(--blue2);padding:9px 16px" onclick="openProdForm()">+ Ajouter</button></div><div style="background:var(--bg2);border-radius:var(--radius);padding:12px;border:1px solid var(--bg3);margin-bottom:14px"><div style="font-size:13px;color:var(--text2);line-height:1.5"><b style="color:#86efac">Foyer</b> = fourni par le foyer. Prix foyer \u2192 <b style="color:#86efac">officielle</b>, diff\u00e9rence \u2192 <b style="color:var(--purple3)">noire</b>.<br><b style="color:var(--purple3)">Achat propre</b> = achet\u00e9 par vous. Tout \u2192 <b style="color:var(--purple3)">noire</b>.</div></div>'+rows+'</div>';
}

// ====== HISTORIQUE ======
function renderHistorique(){
  var filtered=state.transactions;
  if(state.filterMode!=='all')filtered=filtered.filter(function(t){return t.mode===state.filterMode});
  if(state.filterPeriod==='today')filtered=filtered.filter(function(t){return dayKey(t.date)===dayKey(Date.now())});
  if(state.filterPeriod==='day'&&state.selectedDay)filtered=filtered.filter(function(t){return dayKey(t.date)===state.selectedDay});
  if(state.filterPeriod==='month'&&state.selectedMonth)filtered=filtered.filter(function(t){return monthKey(t.date)===state.selectedMonth});
  var fOff=filtered.reduce(function(s,t){return s+((t.mode==='cash'||t.mode==='remboursement')?(t.totalOff||0):0)},0);
  var fNoire=filtered.reduce(function(s,t){return s+((t.mode==='cash'||t.mode==='remboursement')?(t.totalNoire||0):0)},0);
  var fCredit=filtered.reduce(function(s,t){return s+(t.mode==='credit'?t.total:0)},0);
  var allDays=uniq(state.transactions.map(function(t){return dayKey(t.date)}));
  var allMonths=uniq(state.transactions.map(function(t){return monthKey(t.date)}));
  var pSel='';
  if(state.filterPeriod==='day')pSel='<select style="padding:6px 10px;font-size:12px;width:auto" onchange="update({selectedDay:this.value})"><option value="">Jour...</option>'+allDays.map(function(d){return '<option value="'+d+'"'+(state.selectedDay===d?' selected':'')+'>'+d+'</option>'}).join('')+'</select>';
  if(state.filterPeriod==='month')pSel='<select style="padding:6px 10px;font-size:12px;width:auto" onchange="update({selectedMonth:this.value})"><option value="">Mois...</option>'+allMonths.map(function(m){return '<option value="'+m+'"'+(state.selectedMonth===m?' selected':'')+'>'+m+'</option>'}).join('')+'</select>';
  var txH='';
  if(!filtered.length)txH='<div class="empty">Aucune transaction</div>';
  else filtered.forEach(function(tx){
    var label=tx.mode==='cash'?'\uD83D\uDCB0 Cash':tx.mode==='credit'?'\uD83D\uDCCB '+esc(tx.creditName):'\uD83D\uDD04 Remb.';
    txH+='<div class="tx-row"><div style="flex:1;min-width:0"><div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+tx.items.map(function(i){return esc(i.name)+' \u00d7'+i.qty}).join(', ')+'</div><div style="font-size:10px;color:var(--text2)">'+dateStr(tx.date)+' \u2014 '+label+'</div></div><div style="display:flex;flex-direction:column;align-items:flex-end;margin-right:6px"><div style="font-weight:700;font-size:14px">'+fmt(tx.total)+'</div><div style="font-size:9px;color:var(--text3)"><span style="color:#86efac">'+fmt(tx.totalOff||0)+'</span> + <span style="color:var(--purple3)">'+fmt(tx.totalNoire||0)+'</span></div></div><button class="btn-xs" style="background:var(--red2)" onclick="cancelTx(\''+tx.id+'\')">\u2715</button></div>';
  });
  return '<div class="p-16"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px" class="mb-12"><h2 class="section-title">Historique</h2><button class="btn-sm" style="background:var(--blue2)" onclick="update({modal:\'export\'})">Export</button></div><div class="flex-wrap mb-8">'+[['all','Tout'],['cash','Cash'],['credit','Ardoise'],['remboursement','Remb.']].map(function(x){return '<button class="filter-btn '+(state.filterMode===x[0]?'active':'')+'" onclick="update({filterMode:\''+x[0]+'\'})">' +x[1]+'</button>'}).join('')+'</div><div class="flex-wrap mb-12" style="align-items:center">'+[['all','Tout'],['today',"Aujourd'hui"],['day','Jour'],['month','Mois']].map(function(x){return '<button class="filter-btn '+(state.filterPeriod===x[0]?'active-purple':'')+'" onclick="update({filterPeriod:\''+x[0]+'\'})">' +x[1]+'</button>'}).join('')+pSel+'</div><div class="flex-wrap mb-14"><span class="badge" style="background:#22c55e22;border:1px solid #22c55e55;color:var(--green)">Off: '+fmt(fOff)+'</span><span class="badge" style="background:#a855f722;border:1px solid #a855f755;color:var(--purple)">Noire: '+fmt(fNoire)+'</span><span class="badge" style="background:#f59e0b22;border:1px solid #f59e0b55;color:var(--yellow)">Ardoise: '+fmt(fCredit)+'</span></div><div style="max-height:55vh;overflow-y:auto">'+txH+'</div></div>';
}
window.cancelTx=function(id){var tx=state.transactions.find(function(t){return t.id===id});if(!tx)return;if(tx.mode==='cash'){state.caisseOff-=(tx.totalOff||0);state.caisseNoire-=(tx.totalNoire||0)}tx.items.forEach(function(item){var p=state.products.find(function(pr){return pr.name===item.name});if(p)p.stock+=item.qty});state.transactions=state.transactions.filter(function(t){return t.id!==id});update({})};
function getExportCSV(){var f=state.transactions;if(state.filterMode!=='all')f=f.filter(function(t){return t.mode===state.filterMode});if(state.filterPeriod==='today')f=f.filter(function(t){return dayKey(t.date)===dayKey(Date.now())});if(state.filterPeriod==='day'&&state.selectedDay)f=f.filter(function(t){return dayKey(t.date)===state.selectedDay});if(state.filterPeriod==='month'&&state.selectedMonth)f=f.filter(function(t){return monthKey(t.date)===state.selectedMonth});var rows=[['Date','Mode','Articles','Total','Officielle','Noire'].join(';')];f.forEach(function(tx){rows.push([dateStr(tx.date),tx.mode,tx.items.map(function(i){return i.name+' x'+i.qty}).join(' + '),tx.total.toFixed(2),(tx.totalOff||0).toFixed(2),(tx.totalNoire||0).toFixed(2)].join(';'))});return rows.join('\n')}

// ====== COMPTA ======
function renderCompta(){
  var today=dayKey(Date.now());var tTx=state.transactions.filter(function(t){return dayKey(t.date)===today});
  var tCashOff=tTx.reduce(function(s,t){return s+(t.mode==='cash'?(t.totalOff||0):0)},0);
  var tCashNoire=tTx.reduce(function(s,t){return s+(t.mode==='cash'?(t.totalNoire||0):0)},0);
  var tCredit=tTx.reduce(function(s,t){return s+(t.mode==='credit'?t.total:0)},0);
  var totalCredit=state.credits.reduce(function(s,c){return s+c.amount},0);
  var aOff=state.transactions.reduce(function(s,t){return s+((t.mode==='cash'||t.mode==='remboursement')?(t.totalOff||0):0)},0);
  var aNoire=state.transactions.reduce(function(s,t){return s+((t.mode==='cash'||t.mode==='remboursement')?(t.totalNoire||0):0)},0);
  var prodBreakdown={};tTx.forEach(function(tx){if(tx.mode!=='cash')return;tx.items.forEach(function(i){if(!prodBreakdown[i.name])prodBreakdown[i.name]={qty:0,off:0,noire:0,total:0};prodBreakdown[i.name].qty+=i.qty;prodBreakdown[i.name].off+=(i.partOff||0)*i.qty;prodBreakdown[i.name].noire+=(i.partNoire||0)*i.qty;prodBreakdown[i.name].total+=i.prixVente*i.qty})});
  var breakdown=Object.entries(prodBreakdown).sort(function(a,b){return b[1].total-a[1].total});
  var stats=[['Caisse officielle',fmt(state.caisseOff),'var(--green)'],['Caisse noire',fmt(state.caisseNoire),'var(--purple)'],['Recettes jour (off.)',fmt(tCashOff),'var(--blue)'],['Recettes jour (noire)',fmt(tCashNoire),'#8b5cf6'],['Ardoises du jour',fmt(tCredit),'var(--yellow)'],['Total ardoises dues',fmt(totalCredit),'var(--red)'],['CA total officiel',fmt(aOff),'#059669'],['CA total noire',fmt(aNoire),'var(--purple2)']];
  var breakdownH='';
  if(!breakdown.length)breakdownH='<div class="empty">Pas de ventes cash aujourd\'hui</div>';
  else{breakdownH='<div class="stock-table"><div class="stock-header"><span style="flex:2">Produit</span><span style="flex:1;text-align:center">Qt\u00e9</span><span style="flex:1;text-align:center">Off.</span><span style="flex:1;text-align:center">Noire</span><span style="flex:1;text-align:center">Total</span></div>';breakdown.forEach(function(b){breakdownH+='<div class="stock-row"><span style="flex:2;font-weight:600">'+esc(b[0])+'</span><span style="flex:1;text-align:center">'+b[1].qty+'</span><span style="flex:1;text-align:center;color:#86efac">'+fmt(b[1].off)+'</span><span style="flex:1;text-align:center;color:var(--purple3)">'+fmt(b[1].noire)+'</span><span style="flex:1;text-align:center;font-weight:700">'+fmt(b[1].total)+'</span></div>'});breakdownH+='<div class="stock-row" style="background:var(--bg3);font-weight:700"><span style="flex:2">TOTAL</span><span style="flex:1;text-align:center">'+breakdown.reduce(function(s,b){return s+b[1].qty},0)+'</span><span style="flex:1;text-align:center;color:#86efac">'+fmt(tCashOff)+'</span><span style="flex:1;text-align:center;color:var(--purple3)">'+fmt(tCashNoire)+'</span><span style="flex:1;text-align:center">'+fmt(tCashOff+tCashNoire)+'</span></div></div>'}
  return '<div class="p-16"><h2 class="section-title">Comptabilit\u00e9</h2><div class="grid-auto" style="margin:12px 0 18px">'+stats.map(function(s){return '<div class="stat-card" style="border-left:4px solid '+s[2]+'"><div style="font-size:11px;color:var(--text2)">'+s[0]+'</div><div style="font-size:20px;font-weight:800;color:'+s[2]+'">'+s[1]+'</div></div>'}).join('')+'</div><h3 class="section-title" style="font-size:14px;margin-bottom:8px">D\u00e9tail recettes du jour</h3>'+breakdownH+'</div>';
}

// ====== CLOTURE ======
function renderCloture(){
  var today=dayKey(Date.now());var tTx=state.transactions.filter(function(t){return dayKey(t.date)===today});
  var tCashOff=tTx.reduce(function(s,t){return s+(t.mode==='cash'?(t.totalOff||0):0)},0);
  var tCashNoire=tTx.reduce(function(s,t){return s+(t.mode==='cash'?(t.totalNoire||0):0)},0);
  var tCredit=tTx.reduce(function(s,t){return s+(t.mode==='credit'?t.total:0)},0);
  var tNb=tTx.length;var lowStock=state.products.filter(function(p){return p.stock<=5});
  var clH='';if(!state.closings.length)clH='<div class="empty">Aucune cl\u00f4ture</div>';
  else state.closings.forEach(function(cl){
    var notes='';if(cl.notes&&cl.notes.length)cl.notes.forEach(function(n){notes+='<div style="font-size:10px;color:var(--yellow);margin-top:2px">\uD83D\uDCDD '+dateStr(n.date)+' \u2014 '+esc(n.text)+'</div>'});
    clH+='<div class="closing-card"><div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:6px"><div><div style="font-weight:700;font-size:14px">\uD83D\uDCC5 '+cl.day+'</div><div style="font-size:11px;color:var(--text2)">Off: '+fmt(cl.cashOff)+' \u00b7 Noire: '+fmt(cl.cashNoire)+' \u00b7 '+cl.nbTransactions+' tx</div><div style="font-size:11px;color:var(--blue3);margin-top:2px">\uD83D\uDD12 '+esc(cl.closedBy)+'</div>'+notes+'</div><div class="flex-wrap"><button class="btn-sm" style="background:var(--bg3)" onclick="viewClosingDetail(\''+cl.id+'\')">Voir</button><button class="btn-sm" style="background:var(--blue2)" onclick="copyClosing(\''+cl.id+'\')">Copier</button><button class="btn-sm" style="background:var(--yellow2)" onclick="startAction(\''+cl.id+'\',\'addNote\')">\uD83D\uDCDD</button><button class="btn-sm" style="background:var(--red2)" onclick="startAction(\''+cl.id+'\',\'delete\')">\uD83D\uDDD1</button></div></div></div>';
  });
  return '<div class="p-16"><h2 class="section-title">Cl\u00f4ture</h2><div style="background:var(--bg2);border-radius:12px;padding:14px;margin:12px 0;border:1px solid var(--bg3)"><div style="font-size:14px;font-weight:700;margin-bottom:10px;color:var(--text2)">\uD83D\uDCC5 '+today+'</div><div class="grid-2"><div><span style="color:var(--text2);font-size:12px">Cash \u2192 officielle</span><div style="font-size:19px;font-weight:800;color:var(--green)">'+fmt(tCashOff)+'</div></div><div><span style="color:var(--text2);font-size:12px">Cash \u2192 noire</span><div style="font-size:19px;font-weight:800;color:var(--purple3)">'+fmt(tCashNoire)+'</div></div><div><span style="color:var(--text2);font-size:12px">Ardoises</span><div style="font-size:19px;font-weight:800;color:var(--yellow)">'+fmt(tCredit)+'</div></div><div><span style="color:var(--text2);font-size:12px">Transactions</span><div style="font-size:19px;font-weight:800;color:var(--blue3)">'+tNb+'</div></div></div><div class="grid-2 mt-10" style="padding-top:10px;border-top:1px solid var(--bg3)"><div><span style="color:var(--text2);font-size:12px">Solde officielle</span><div style="font-size:17px;font-weight:800;color:var(--green)">'+fmt(state.caisseOff)+'</div></div><div><span style="color:var(--text2);font-size:12px">Solde noire</span><div style="font-size:17px;font-weight:800;color:var(--purple3)">'+fmt(state.caisseNoire)+'</div></div></div>'+(lowStock.length?'<div class="mt-10" style="padding-top:8px;border-top:1px solid var(--bg3)"><div style="font-size:12px;color:var(--red);font-weight:700">\u26A0\uFE0F Stocks bas</div><div style="font-size:12px;color:#fca5a5">'+lowStock.map(function(p){return esc(p.name)+' ('+p.stock+')'}).join(' \u00b7 ')+'</div></div>':'')+'<button class="btn mt-12" style="background:var(--red2)" onclick="update({modal:\'closeConfirm\',formError:\'\',closerName:\'\',closerPassword:\'\'})">\uD83D\uDD12 Cl\u00f4turer</button></div><h3 class="section-title mt-14" style="font-size:14px;margin-bottom:8px">Historique</h3>'+clH+'</div>';
}

function exportClosingText(cl){
  var l=['CL\u00d4TURE DU '+cl.day,'Cl\u00f4tur\u00e9e par : '+cl.closedBy,'\u2550'.repeat(35),'','CAISSES','  Officielle : '+fmt(cl.caisseOff),'  Noire      : '+fmt(cl.caisseNoire),'','RECETTES DU JOUR','  Cash \u2192 officielle : '+fmt(cl.cashOff),'  Cash \u2192 noire      : '+fmt(cl.cashNoire),'  Ardoises           : '+fmt(cl.creditTotal),'  Nb transactions    : '+cl.nbTransactions];
  if(cl.detailProduits&&cl.detailProduits.length){l.push('','D\u00c9TAIL PAR PRODUIT');cl.detailProduits.forEach(function(d){l.push('  '+d.name.padEnd(20)+' x'+String(d.qty).padStart(3)+'  off '+fmt(d.off).padStart(8)+'  noire '+fmt(d.noire).padStart(8))})}
  l.push('','STOCK');cl.stockSnapshot.forEach(function(s){l.push('  '+s.name.padEnd(22)+String(s.stock).padStart(4))});
  l.push('','ARDOISES');if(cl.creditSnapshot.length)cl.creditSnapshot.forEach(function(c){l.push('  '+c.name.padEnd(22)+fmt(c.amount))});else l.push('  Aucune');
  if(cl.notes&&cl.notes.length){l.push('','NOTES');cl.notes.forEach(function(n){l.push('  '+dateStr(n.date)+' \u2014 '+n.text)})}
  return l.join('\n');
}

window.doCloseDay=function(){
  if(!state.closerName.trim()){state.formError='Entre ton nom';render();return}
  if(!state.closerPassword.trim()){state.formError='Choisis un mot de passe';render();return}
  if(state.closerPassword.trim().length<4){state.formError='Min. 4 caract\u00e8res';render();return}
  var today=dayKey(Date.now());var tTx=state.transactions.filter(function(t){return dayKey(t.date)===today});
  var prodBreak={};tTx.forEach(function(tx){if(tx.mode!=='cash')return;tx.items.forEach(function(i){if(!prodBreak[i.name])prodBreak[i.name]={name:i.name,qty:0,off:0,noire:0};prodBreak[i.name].qty+=i.qty;prodBreak[i.name].off+=(i.partOff||0)*i.qty;prodBreak[i.name].noire+=(i.partNoire||0)*i.qty})});
  var closing={id:uid(),date:Date.now(),day:today,closedBy:state.closerName.trim(),passwordHash:simpleHash(state.closerPassword.trim()),caisseOff:state.caisseOff,caisseNoire:state.caisseNoire,cashOff:tTx.reduce(function(s,t){return s+(t.mode==='cash'?(t.totalOff||0):0)},0),cashNoire:tTx.reduce(function(s,t){return s+(t.mode==='cash'?(t.totalNoire||0):0)},0),creditTotal:tTx.reduce(function(s,t){return s+(t.mode==='credit'?t.total:0)},0),nbTransactions:tTx.length,detailProduits:Object.values(prodBreak),stockSnapshot:state.products.map(function(p){return{name:p.name,stock:p.stock}}),creditSnapshot:state.credits.map(function(c){return{name:c.name,amount:c.amount}}),notes:[]};
  state.closings=[closing].concat(state.closings);update({modal:null,closerName:'',closerPassword:'',formError:''});
};
window.viewClosingDetail=function(id){state.viewClosing=state.closings.find(function(c){return c.id===id});update({modal:'viewClosing'})};
window.copyClosing=function(id){var cl=state.closings.find(function(c){return c.id===id});if(cl&&navigator.clipboard)navigator.clipboard.writeText(exportClosingText(cl))};
window.startAction=function(id,action){state.actionClosing={closing:state.closings.find(function(c){return c.id===id}),action:action};state.actionPassword='';state.actionError='';state.actionNote='';update({modal:'closingAction'})};
window.doClosingAction=function(){var ac=state.actionClosing;if(!ac)return;if(simpleHash(state.actionPassword.trim())!==ac.closing.passwordHash){state.actionError='Mot de passe incorrect';render();return}if(ac.action==='delete')state.closings=state.closings.filter(function(c){return c.id!==ac.closing.id});else if(ac.action==='addNote'){if(!state.actionNote.trim()){state.actionError='\u00c9cris une note';render();return}state.closings=state.closings.map(function(c){return c.id===ac.closing.id?Object.assign({},c,{notes:(c.notes||[]).concat([{date:Date.now(),text:state.actionNote.trim()}])}):c})}update({modal:null,actionClosing:null,actionPassword:'',actionError:'',actionNote:''})};

// ====== MODALS ======
function renderModal(){
  if(!state.modal)return '';
  if(state.modal==='credit'){
    var sug='';if(state.credits.length){sug='<div class="mt-10"><div style="font-size:12px;color:var(--text2);margin-bottom:5px">Existantes :</div><div class="flex-wrap">';state.credits.forEach(function(c){sug+='<button class="filter-btn" onclick="state.creditName=\''+c.name.replace(/'/g,"\\'") +'\';render()">'+esc(c.name)+' ('+fmt(c.amount)+')</button>'});sug+='</div></div>'}
    return modalHTML('Ardoise','<input placeholder="Nom / pr\u00e9nom" value="'+esc(state.creditName)+'" oninput="state.creditName=this.value" autofocus>'+sug+'<button class="btn mt-12" style="background:var(--yellow2)" onclick="confirmCredit()">Confirmer</button>');
  }
  if(state.modal==='payCredit'&&state.selectedCredit)return modalHTML('Encaisser \u2014 '+state.selectedCredit.name,'<div style="margin-bottom:10px;color:#d1d5db">D\u00fb : <b>'+fmt(state.selectedCredit.amount)+'</b></div><input placeholder="Montant (vide = tout)" value="'+esc(state.payAmount)+'" oninput="state.payAmount=this.value" inputmode="decimal"><button class="btn mt-10" style="background:var(--green2)" onclick="payOffCredit()">Valider</button>');
  if(state.modal==='prodForm'){
    var f=state.prodForm;var pv=parseFloat((f.prixVente||'0').replace(',','.'));var pf=parseFloat((f.prixFoyer||'0').replace(',','.'));var pp=parseFloat((f.packPrix||'0').replace(',','.'));var pq=parseInt(f.packQte)||1;
    var preview='';
    if(f.source==='foyer'&&pv>0){var marge=pv-pf;preview='<div style="background:var(--bg);border-radius:8px;padding:10px;border:1px solid var(--bg3)"><div style="font-size:12px;color:var(--text2);margin-bottom:4px">R\u00e9partition :</div><div style="font-size:13px"><span style="color:#86efac;font-weight:700">'+fmt(pf)+'</span> \u2192 officielle \u00b7 <span style="color:var(--purple3);font-weight:700">'+fmt(marge)+'</span> \u2192 noire</div></div>'}
    else if(f.source==='propre'&&pv>0){var cu=pq>0?pp/pq:0;var benef=pv-cu;preview='<div style="background:var(--bg);border-radius:8px;padding:10px;border:1px solid var(--bg3)"><div style="font-size:12px;color:var(--text2);margin-bottom:4px">Calcul :</div><div style="font-size:13px">Co\u00fbt unit. : <span style="color:var(--yellow);font-weight:700">'+fmt(cu)+'</span> \u00b7 B\u00e9n\u00e9f. : <span style="color:'+(benef>=0?'var(--green)':'var(--red)')+';font-weight:700">'+fmt(benef)+'</span></div><div style="font-size:13px;margin-top:4px"><span style="color:var(--purple3);font-weight:700">'+fmt(pv)+'</span> \u2192 tout en noire</div></div>'}
    return modalHTML(state.editProductId?'Modifier':'Ajouter','<div style="display:flex;flex-direction:column;gap:10px"><input placeholder="Nom" value="'+esc(f.name)+'" oninput="setProdField(\'name\',this.value)"><input placeholder="Cat\u00e9gorie" value="'+esc(f.category)+'" oninput="setProdField(\'category\',this.value)"><div style="display:flex;gap:8px"><button class="filter-btn" style="flex:1;'+(f.source==='foyer'?'background:var(--green2);color:#fff;font-weight:700':'')+'" onclick="setProdField(\'source\',\'foyer\')">Foyer</button><button class="filter-btn" style="flex:1;'+(f.source==='propre'?'background:var(--purple2);color:#fff;font-weight:700':'')+'" onclick="setProdField(\'source\',\'propre\')">Achat propre</button></div><div><label class="label">Prix de vente</label><input placeholder="0,50" value="'+esc(f.prixVente)+'" oninput="setProdField(\'prixVente\',this.value)" inputmode="decimal"></div>'+(f.source==='foyer'?'<div><label class="label">Prix foyer</label><input placeholder="0,40" value="'+esc(f.prixFoyer)+'" oninput="setProdField(\'prixFoyer\',this.value)" inputmode="decimal"><div class="hint">La diff\u00e9rence ira en caisse noire</div></div>':'')+(f.source==='propre'?'<div><label class="label">Prix du pack</label><input placeholder="13,25" value="'+esc(f.packPrix)+'" oninput="setProdField(\'packPrix\',this.value)" inputmode="decimal"></div><div><label class="label">Unit\u00e9s dans le pack</label><input placeholder="24" value="'+esc(f.packQte)+'" oninput="setProdField(\'packQte\',this.value)" inputmode="numeric"><div class="hint">Pour le co\u00fbt unitaire r\u00e9el</div></div>':'')+'<div><label class="label">Stock</label><input placeholder="Quantit\u00e9" value="'+esc(f.stock)+'" oninput="setProdField(\'stock\',this.value)" inputmode="numeric"></div>'+preview+'<button class="btn" style="background:var(--blue2)" onclick="saveProduct()">'+(state.editProductId?'Modifier':'Ajouter')+'</button></div>');
  }
  if(state.modal==='export')return modalHTML('Exporter','<textarea style="height:200px;font-family:monospace;font-size:11px" readonly onclick="this.select()">'+esc(getExportCSV())+'</textarea><button class="btn mt-10" style="background:var(--blue2)" onclick="navigator.clipboard.writeText(document.querySelector(\'.modal textarea\').value)">\uD83D\uDCCB Copier</button>',true);
  if(state.modal==='closeConfirm')return modalHTML('Cl\u00f4turer','<p style="color:#d1d5db;margin-bottom:12px;font-size:13px">Signe avec ton nom et mot de passe.</p><div style="display:flex;flex-direction:column;gap:10px"><div><label class="label">Ton nom</label><input placeholder="Pr\u00e9nom Nom" value="'+esc(state.closerName)+'" oninput="state.closerName=this.value;state.formError=\'\';var e=document.querySelector(\'.error\');if(e)e.remove()"></div><div><label class="label">Mot de passe</label><input type="password" placeholder="Min. 4 car." value="'+esc(state.closerPassword)+'" oninput="state.closerPassword=this.value;state.formError=\'\';var e=document.querySelector(\'.error\');if(e)e.remove()"></div>'+(state.formError?'<div class="error">'+esc(state.formError)+'</div>':'')+'<button class="btn" style="background:var(--red2)" onclick="doCloseDay()">\uD83D\uDD12 Confirmer</button></div>');
  if(state.modal==='viewClosing'&&state.viewClosing)return modalHTML('Cl\u00f4ture '+state.viewClosing.day,'<textarea style="height:300px;font-family:monospace;font-size:11px;white-space:pre" readonly onclick="this.select()">'+esc(exportClosingText(state.viewClosing))+'</textarea><button class="btn mt-10" style="background:var(--blue2)" onclick="navigator.clipboard.writeText(document.querySelector(\'.modal textarea\').value)">\uD83D\uDCCB Copier</button>',true);
  if(state.modal==='closingAction'&&state.actionClosing){var ac=state.actionClosing;return modalHTML(ac.action==='delete'?'Supprimer':'Note','<div style="background:var(--bg);border-radius:8px;padding:10px;margin-bottom:12px;border:1px solid var(--bg3)"><div style="font-size:12px;color:var(--text2)">Sign\u00e9e par</div><div style="font-size:15px;font-weight:700;color:var(--blue3)">\uD83D\uDD12 '+esc(ac.closing.closedBy)+'</div></div>'+(ac.action==='addNote'?'<div class="mb-8"><label class="label">Note</label><textarea style="height:60px" placeholder="Ex: Manquait 2\u20ac..." oninput="state.actionNote=this.value;state.actionError=\'\';var e=document.querySelector(\'.error\');if(e)e.remove()">'+esc(state.actionNote)+'</textarea></div>':'')+'<div><label class="label">Mot de passe de '+esc(ac.closing.closedBy)+'</label><input type="password" placeholder="Mot de passe" value="'+esc(state.actionPassword)+'" oninput="state.actionPassword=this.value;state.actionError=\'\';var e=document.querySelector(\'.error\');if(e)e.remove()"></div>'+(state.actionError?'<div class="error">'+esc(state.actionError)+'</div>':'')+'<button class="btn mt-10" style="background:'+(ac.action==='delete'?'var(--red2)':'var(--yellow2)')+'" onclick="doClosingAction()">'+(ac.action==='delete'?'\uD83D\uDDD1 Supprimer':'\uD83D\uDCDD Ajouter')+'</button>')}
  return '';
}

// ====== RENDER ======
function render(){
  var tabs={Caisse:renderCaisse,Ardoises:renderArdoises,Stock:renderStock,Admin:renderAdmin,Historique:renderHistorique,Compta:renderCompta,'Cl\u00f4ture':renderCloture};
  document.getElementById('app').innerHTML='<header><div class="logo">\uD83C\uDF7A Bar CHG</div><div style="display:flex;align-items:center;gap:6px"><span class="offline-badge '+(navigator.onLine?'':'show')+'">HORS LIGNE</span><div class="caisse-tags"><div class="caisse-tag off">Off: '+fmt(state.caisseOff)+'</div><div class="caisse-tag noire">Noire: '+fmt(state.caisseNoire)+'</div></div></div></header><nav>'+TABS.map(function(t){return '<button class="'+(state.tab===t.id?'active':'')+'" onclick="update({tab:\''+t.id+'\'})">' +t.icon+' '+t.id+'</button>'}).join('')+'</nav><main>'+tabs[state.tab]()+'</main>'+renderModal();
}
render();
