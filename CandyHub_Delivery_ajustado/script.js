/* CandyHub Delivery — lógica reconstruída do zero. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const state = { user: null, profile: null, stores: [], products: [], activeStore: null, activeProduct: null, selectedFlavor: '', selectedSize: '', selectedPrice: 0, cart: [], category: 'todas', storeCategory: 'todas', reviewRating: 0, currentStoreCategory: 'todas', activeOrder: null };
  const money = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const client = () => {
    if (!window.supabaseClient) throw new Error('A configuração do Supabase está incompleta. Abra supabase-config.js e cole a chave pública do projeto.');
    return window.supabaseClient;
  };
  function toast(msg) {
    const wrap = $('#toastWrap'); if (!wrap) return alert(msg);
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg; wrap.appendChild(el); setTimeout(() => el.remove(), 4200);
  }
  function show(id) { const el = typeof id === 'string' ? $('#' + id) : id; if (!el) return; el.classList.add('open'); el.setAttribute('aria-hidden','false'); $('#overlay')?.classList.add('open'); document.body.style.overflow = 'hidden'; }
  function hide(id) { const el = typeof id === 'string' ? $('#' + id) : id; if (!el) return; el.classList.remove('open'); el.setAttribute('aria-hidden','true'); if (!$$('.modal.open, .drawer.open').length) { $('#overlay')?.classList.remove('open'); document.body.style.overflow = ''; } }
  function showMessage(id, msg, error = false) { const el = $('#' + id); if (el) { el.textContent = msg; el.style.color = error ? '#a04444' : '#39764c'; } }
  function requireConfig() { if (!window.supabaseClient) { toast('Falta configurar a chave pública do Supabase no arquivo supabase-config.js.'); return false; } return true; }
  function setAuthButton() { const btn = $('#accountBtn'); if (btn) btn.textContent = state.user ? `Olá, ${(state.profile?.nome || state.user.email || 'cliente').split(' ')[0]}` : 'Entrar / Criar conta'; }
  function activateTab(tab) { $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab)); $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${tab}`)); }
  async function getUser() { const { data, error } = await client().auth.getUser(); if (error) throw error; state.user = data.user || null; return state.user; }
  async function uploadImage(file) {
    if (!file) return null;
    const user = state.user || await getUser(); if (!user) throw new Error('Entre na sua conta para enviar imagens.');
    if (!file.type.startsWith('image/')) throw new Error('Selecione um arquivo de imagem.');
    if (file.size > 5 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 5 MB.');
    const ext = (file.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi,'').toLowerCase();
    const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await client().storage.from('produtos').upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw error;
    return client().storage.from('produtos').getPublicUrl(path).data.publicUrl;
  }
  async function loadProfile() {
    if (!state.user) { state.profile = null; return; }
    const { data } = await client().from('perfis').select('*').eq('id', state.user.id).maybeSingle();
    state.profile = data || { nome: state.user.user_metadata?.nome || state.user.email };
  }
  async function loadData() {
    try {
      if (!window.supabaseClient) { renderStores(); renderProducts(); return; }
      const [storesRes, productsRes] = await Promise.all([
        client().from('confeitarias').select('*').order('created_at', { ascending: false }),
        client().from('produtos').select('*').eq('ativo', true).order('created_at', { ascending: false })
      ]);
      if (storesRes.error) throw storesRes.error;
      if (productsRes.error) throw productsRes.error;
      state.stores = storesRes.data || []; state.products = productsRes.data || [];
      if (state.user) {
        const { data: own } = await client().from('produtos').select('*').eq('usuario_id', state.user.id).order('created_at', { ascending: false });
        if (own) { const byId = new Map(state.products.map(p => [p.id,p])); own.forEach(p => { if (!byId.has(p.id)) byId.set(p.id,p); }); state.products = [...byId.values()]; }
      }
      renderStores(); renderProducts();
      if (state.activeStore) renderStoreModal();
    } catch (e) { toast(`Não foi possível carregar os dados: ${e.message || e}`); }
  }
  function categoryMatch(list, cat) { if (!cat || cat === 'todas') return true; return (list || []).some(x => String(x).toLowerCase().includes(cat)); }
  function getStore(product) { return state.stores.find(s => s.id === product.confeitaria_id); }
  function storeCard(s) {
    const cats = Array.isArray(s.categorias) ? s.categorias : [];
    const img = s.imagem_url ? `style="background-image:url('${escapeHtml(s.imagem_url)}')"` : '';
    const meta = `${escapeHtml(s.tempo_entrega || '30–45 min')} · ${escapeHtml(s.cidade || '')} · ${money(s.taxa_entrega)}`;
    return `<article class="store-card"><div class="store-cover" ${img}></div><div class="store-card-body"><div class="store-title-row"><h3>${escapeHtml(s.nome)}</h3><span class="store-rating">★ ${Number(s.rating || 0).toFixed(1)}</span></div><p>${escapeHtml(s.descricao || 'Conheça nossos produtos.')}</p><div class="store-meta"><span>🛵 ${escapeHtml(s.tempo_entrega || '30–45 min')}</span><span>📍 ${escapeHtml(s.cidade || '')}</span><span>💰 ${money(s.taxa_entrega)}</span></div><div class="store-tags">${cats.map(c=>`<span>${escapeHtml(c)}</span>`).join('')}</div><button class="btn btn-primary btn-block open-store" type="button" data-store-id="${s.id}">Ver loja e cardápio</button></div></article>`;
  }
  function renderStores() {
    const q = ($('#searchInput')?.value || '').trim().toLowerCase();
    const filtered = state.stores.filter(s => {
      const catOk = state.storeCategory === 'todas' || categoryMatch(s.categorias, state.storeCategory) || state.products.some(p => p.confeitaria_id === s.id && String(p.categoria || '').toLowerCase().includes(state.storeCategory));
      const searchOk = !q || `${s.nome} ${s.descricao || ''} ${s.cidade || ''} ${(s.categorias || []).join(' ')}`.toLowerCase().includes(q) || state.products.some(p => p.confeitaria_id === s.id && `${p.nome} ${p.categoria} ${p.descricao || ''}`.toLowerCase().includes(q));
      return catOk && searchOk;
    });
    $('#storesGrid').innerHTML = filtered.map(storeCard).join(''); $('#emptyStores').style.display = filtered.length ? 'none' : 'block';
    $('#storeStat').textContent = state.stores.length; $('#productStat').textContent = state.products.filter(p=>p.ativo !== false).length;
  }
  function productCard(p, featured = false) {
    const store = getStore(p); const img = p.imagem_url ? `style="background-image:url('${escapeHtml(p.imagem_url)}')"` : '';
    if (featured) return `<article class="featured-card" data-product-id="${p.id}" role="button" tabindex="0"><div class="featured-img" ${img}></div><div><small>${escapeHtml(store?.nome || 'Confeitaria')}</small><h3>${escapeHtml(p.nome)}</h3><p>${escapeHtml(p.descricao || '')}</p><strong>${money(p.preco)}</strong></div></article>`;
    return `<article class="mini-product" data-product-id="${p.id}" tabindex="0"><div class="mini-product-img" ${img}></div><div class="mini-product-info"><small>${escapeHtml(p.categoria || 'Produto')}</small><h3>${escapeHtml(p.nome)}</h3><p>${escapeHtml(p.descricao || '')}</p><strong>${money(p.preco)}</strong></div></article>`;
  }
  function renderProducts() {
    const q = ($('#searchInput')?.value || '').trim().toLowerCase();
    const filtered = state.products.filter(p => p.ativo !== false && (state.category === 'todas' || String(p.categoria || '').toLowerCase().includes(state.category)) && (!q || `${p.nome} ${p.descricao || ''} ${p.categoria || ''} ${(p.sabores || []).join(' ')} ${getStore(p)?.nome || ''}`.toLowerCase().includes(q)));
    $('#featuredGrid').innerHTML = filtered.map(p=>productCard(p,true)).join(''); $('#emptyProducts').style.display = filtered.length ? 'none' : 'block';
    $('#productStat').textContent = state.products.filter(p=>p.ativo !== false).length;
  }
  function openAuth(tab='login') { if (!requireConfig()) return; activateTab(tab); showMessage('authMsg',''); show('authModal'); }
  async function openAccount() {
    if (!state.user) return openAuth('login');
    $('#accountGreeting').textContent = `Olá, ${state.profile?.nome || state.user.email || 'cliente'}!`;
    const active = await findActiveOrder().catch(()=>null);
    const favorites = await loadUserFavorites().catch(()=>[]);
    const favoritesHtml = favorites.length
      ? `<section class="account-favorites"><h3>Minhas confeitarias favoritas</h3><div class="account-favorites-list">${favorites.map(f => {
          const store = state.stores.find(s => s.id === f.confeitaria_id);
          return store ? `<div class="account-favorite-item"><span>${escapeHtml(store.nome)}</span><div><button type="button" class="btn btn-outline" data-open-favorite="${escapeHtml(store.id)}">Ver confeitaria</button><button type="button" class="btn btn-outline" data-remove-favorite="${escapeHtml(f.id)}">Remover</button></div></div>` : '';
        }).join('')}</div></section>`
      : '<section class="account-favorites"><h3>Minhas confeitarias favoritas</h3><p>Você ainda não favoritou nenhuma confeitaria.</p></section>';
    $('#accountContent').innerHTML = `<p>${escapeHtml(state.user.email || '')}</p>${active ? `<p><strong>Pedido mais recente em andamento:</strong> ${escapeHtml(active.codigo)} — ${escapeHtml(active.status)}.</p><p>Você pode realizar outros pedidos mesmo enquanto este estiver em andamento.</p>` : '<p>Você não tem pedido ativo no momento.</p>'}${favoritesHtml}`;
    show('accountModal');
  }
  async function findActiveOrder() {
    if (!state.user) return null;
    const { data, error } = await client().from('pedidos').select('*').eq('usuario_id', state.user.id).in('status',['recebido','em_andamento','preparando','em_entrega']).order('created_at',{ascending:false}).limit(1).maybeSingle();
    if (error && !/multiple|JSON object requested/i.test(error.message)) throw error;
    state.activeOrder = data || null; return state.activeOrder;
  }
  async function openManage() {
    if (!state.user) return openAuth('login');
    try {
      const { data, error } = await client().from('confeitarias').select('*').eq('usuario_id',state.user.id).maybeSingle();
      if (error) throw error;
      const s = data || {}; $('#storeId').value = s.id || ''; $('#storeName').value = s.nome || ''; $('#storeCity').value = s.cidade || 'Belo Horizonte'; $('#storeDesc').value = s.descricao || ''; $('#storeTime').value = s.tempo_entrega || '30–45 min'; $('#storeDelivery').value = s.taxa_entrega ?? 0; $('#storeCategories').value = (s.categorias || []).join(', '); $('#storeWhatsapp').value = s.whatsapp_phone || '';
      await renderMyProducts(); show('manageModal');
    } catch(e) { toast(`Erro ao abrir sua confeitaria: ${e.message || e}`); }
  }
  async function renderMyProducts() {
    if (!state.user) return;
    const { data, error } = await client().from('produtos').select('*').eq('usuario_id',state.user.id).order('created_at',{ascending:false});
    if (error) throw error;
    const list = data || [];
    $('#myProductsList').innerHTML = list.length ? list.map(p=>`<div class="my-product"><img src="${escapeHtml(p.imagem_url || '')}" alt="" onerror="this.style.visibility='hidden'"><div><strong>${escapeHtml(p.nome)}</strong><div>${money(p.preco)} · ${escapeHtml(p.categoria)} ${p.ativo ? '' : '· Inativo'}</div></div><div class="my-product-actions"><button type="button" data-edit-product="${p.id}">Editar</button><button type="button" data-delete-product="${p.id}">Excluir</button></div></div>`).join('') : '<div class="empty-market">Você ainda não cadastrou produtos.</div>';
  }
  async function saveStore(ev) {
    ev.preventDefault(); if (!requireConfig()) return;
    try {
      await getUser(); if (!state.user) return openAuth('login');
      const currentId = $('#storeId').value;
      let imageUrl = null;
      if ($('#storeImageFile').files[0]) imageUrl = await uploadImage($('#storeImageFile').files[0]);
      const payload = { usuario_id:state.user.id, nome:$('#storeName').value.trim(), cidade:$('#storeCity').value.trim(), descricao:$('#storeDesc').value.trim(), tempo_entrega:$('#storeTime').value.trim() || '30–45 min', taxa_entrega:Number($('#storeDelivery').value || 0), whatsapp_phone:$('#storeWhatsapp').value.replace(/\D/g,''), categorias:$('#storeCategories').value.split(',').map(x=>x.trim()).filter(Boolean) };
      if (imageUrl) payload.imagem_url = imageUrl;
      let query = currentId ? client().from('confeitarias').update(payload).eq('id',currentId).eq('usuario_id',state.user.id) : client().from('confeitarias').insert(payload);
      const { data, error } = await query.select().single(); if (error) throw error;
      $('#storeId').value = data.id; $('#storeImageFile').value = ''; toast('Confeitaria salva com sucesso!'); await loadData(); await renderMyProducts();
    } catch(e) { toast(`Não foi possível salvar a confeitaria: ${e.message || e}`); }
  }
  function openNewProduct(product = null) {
    if (!state.user) return openAuth('login');
    if (!$('#storeId').value) { toast('Salve os dados da sua confeitaria antes de cadastrar produtos.'); return; }
    $('#productForm').reset(); $('#productId').value = product?.id || ''; $('#productManageTitle').textContent = product ? 'Editar produto' : 'Novo produto';
    if (product) { $('#productName').value = product.nome || ''; $('#productCategory').value = product.categoria || 'Doces'; $('#productDesc').value = product.descricao || ''; $('#productPrice').value = product.preco || ''; $('#productFlavors').value = (product.sabores || []).join(', '); $('#productSizes').value = (product.tamanhos || []).map(t=>`${t.nome}:${t.preco}`).join(', '); }
    show('productManageModal');
  }
  function parseSizes(text) { return text.split(',').map(v=>v.trim()).filter(Boolean).map(v=>{ const i=v.lastIndexOf(':'); if(i<1) throw new Error('Use o formato de tamanhos: Pequeno:30, Médio:45.'); const nome=v.slice(0,i).trim(), preco=Number(v.slice(i+1).trim().replace(',','.')); if(!nome || !Number.isFinite(preco) || preco<=0) throw new Error('Confira os nomes e preços dos tamanhos.'); return {nome,preco}; }); }
  async function saveProduct(ev) {
    ev.preventDefault(); if (!requireConfig()) return;
    try {
      await getUser(); if (!state.user) return openAuth('login');
      const { data: store, error: se } = await client().from('confeitarias').select('id').eq('usuario_id',state.user.id).single(); if (se) throw new Error('Cadastre e salve sua confeitaria primeiro.');
      let imageUrl = null; if ($('#productImageFile').files[0]) imageUrl = await uploadImage($('#productImageFile').files[0]);
      const id = $('#productId').value;
      const payload = { usuario_id:state.user.id, confeitaria_id:store.id, nome:$('#productName').value.trim(), categoria:$('#productCategory').value, descricao:$('#productDesc').value.trim(), preco:Number($('#productPrice').value), sabores:$('#productFlavors').value.split(',').map(x=>x.trim()).filter(Boolean), tamanhos:parseSizes($('#productSizes').value) };
      if (imageUrl) payload.imagem_url = imageUrl;
      const q = id ? client().from('produtos').update(payload).eq('id',id).eq('usuario_id',state.user.id) : client().from('produtos').insert(payload);
      const { error } = await q; if (error) throw error;
      hide('productManageModal'); $('#productImageFile').value=''; toast('Produto salvo com sucesso!'); await loadData(); await renderMyProducts();
    } catch(e) { toast(`Não foi possível salvar o produto: ${e.message || e}`); }
  }
  async function deleteProduct(id) { if (!confirm('Tem certeza que deseja excluir este produto?')) return; try { const {error}=await client().from('produtos').delete().eq('id',id).eq('usuario_id',state.user.id); if(error)throw error; toast('Produto excluído.'); await loadData(); await renderMyProducts(); } catch(e){toast(`Erro ao excluir: ${e.message || e}`);} }
  function openStore(id) { state.activeStore = state.stores.find(s=>s.id===id); if (!state.activeStore) return; state.currentStoreCategory='todas'; renderStoreModal(); show('storeModal'); }
  async function renderStoreModal() {
    const s = state.activeStore; if (!s) return;
    $('#storeModalTitle').textContent = s.nome; $('#storeModalInfo').textContent = `${s.descricao || ''} · ${s.cidade || ''} · Entrega ${s.tempo_entrega || '30–45 min'} · Taxa ${money(s.taxa_entrega)}`;
    $('#storeModalCover').style.backgroundImage = s.imagem_url ? `url("${s.imagem_url}")` : 'none';
    const cats = ['todas', ...new Set(state.products.filter(p=>p.confeitaria_id===s.id).map(p=>p.categoria).filter(Boolean))];
    $('#storeMenuTabs').innerHTML = cats.map(c=>`<button type="button" data-store-cat="${escapeHtml(c)}" class="${c===state.currentStoreCategory?'active':''}">${c==='todas'?'Todos':escapeHtml(c)}</button>`).join('');
    const prods = state.products.filter(p=>p.confeitaria_id===s.id && p.ativo!==false && (state.currentStoreCategory==='todas'||p.categoria===state.currentStoreCategory));
    $('#storeProductsGrid').innerHTML = prods.map(p=>productCard(p)).join('') || '<div class="empty-market">Esta confeitaria ainda não tem produtos disponíveis.</div>';
    await renderReviews(); await updateFavoriteButton();
  }
  function openProduct(id) {
    const p = state.products.find(x=>x.id===id); if (!p) return;
    state.activeProduct=p; state.selectedFlavor=(p.sabores||[])[0]||''; const sizes=Array.isArray(p.tamanhos)?p.tamanhos:[]; state.selectedSize=sizes[0]?.nome||''; state.selectedPrice=Number(sizes[0]?.preco ?? p.preco);
    $('#productModalImage').style.backgroundImage=p.imagem_url?`url("${p.imagem_url}")`:'none'; $('#productModalCat').textContent=p.categoria||'Produto'; $('#productModalTitle').textContent=p.nome; $('#productModalDesc').textContent=p.descricao||''; $('#productObservation').value='';
    const flavors=(p.sabores||[]); $('#flavorOptions').innerHTML=flavors.length?flavors.map((f,i)=>`<button type="button" class="option ${i===0?'selected':''}" data-flavor="${escapeHtml(f)}">${escapeHtml(f)}</button>`).join(''):'<span class="muted">Sabor padrão</span>';
    $('#sizeOptions').innerHTML=sizes.length?sizes.map((t,i)=>`<button type="button" class="option ${i===0?'selected':''}" data-size="${escapeHtml(t.nome)}" data-price="${Number(t.preco)}">${escapeHtml(t.nome)} <b>${money(t.preco)}</b></button>`).join(''):`<button type="button" class="option selected" data-size="Padrão" data-price="${Number(p.preco)}">Padrão <b>${money(p.preco)}</b></button>`;
    $('#productModalPrice').textContent=money(state.selectedPrice); show('productModal');
  }
  function addToCart() {
    const p=state.activeProduct; if(!p)return; const store=getStore(p); if(!store){toast('A confeitaria deste produto não está disponível.');return;}
    const item={key:`${p.id}|${state.selectedFlavor}|${state.selectedSize}`,productId:p.id,name:p.nome,storeId:store.id,store:store.nome,price:Number(state.selectedPrice||p.preco),qty:1,flavor:state.selectedFlavor,size:state.selectedSize,observation:$('#productObservation').value.trim(),delivery:Number(store.taxa_entrega||0)};
    const existing=state.cart.find(x=>x.key===item.key); if(existing){existing.qty++;}else state.cart.push(item); hide('productModal'); updateCart(); toast('Produto adicionado à sacola.');
  }
  function updateCart() {
    const count=state.cart.reduce((n,i)=>n+i.qty,0); $('#cartCount').textContent=count; $('#cartCount').style.display=count?'inline-flex':'none';
    if(!state.cart.length){$('#cartItemsWrap').innerHTML='<div class="empty-market"><h3>Sua sacola está vazia</h3><p>Escolha uma confeitaria e adicione seus favoritos.</p></div>';$('#cartFoot').innerHTML='';return;}
    const groups=[...new Set(state.cart.map(i=>i.storeId))];
    $('#cartItemsWrap').innerHTML=state.cart.map((i,idx)=>`<div class="cart-item"><div><strong>${escapeHtml(i.name)}</strong><small>${escapeHtml(i.store)} · ${escapeHtml(i.flavor||'')} ${escapeHtml(i.size||'')}</small><small>${money(i.price)} cada</small></div><div class="qty"><button type="button" data-qty="-1" data-index="${idx}">−</button><span>${i.qty}</span><button type="button" data-qty="1" data-index="${idx}">+</button></div><button type="button" data-remove-cart="${idx}" aria-label="Remover">×</button></div>`).join('');
    const subtotal=state.cart.reduce((n,i)=>n+i.price*i.qty,0); const delivery=state.cart[0].delivery;
    $('#cartFoot').innerHTML=`${groups.length>1?'<div class="cart-checkout-warning">Sua sacola tem produtos de mais de uma confeitaria. Remova os itens de uma loja para finalizar um pedido por vez.</div>':''}<div style="display:flex;justify-content:space-between;padding:7px 0"><span>Subtotal</span><strong>${money(subtotal)}</strong></div><div style="display:flex;justify-content:space-between;padding:7px 0"><span>Entrega</span><strong>${money(delivery)}</strong></div><div style="display:flex;justify-content:space-between;padding:7px 0"><strong>Total</strong><strong>${money(subtotal+delivery)}</strong></div><button type="button" class="btn btn-primary btn-block" id="checkoutBtn" ${groups.length>1?'disabled':''}>Continuar pedido</button>`;
  }
  async function beginCheckout() {
    if(!state.cart.length)return; if(new Set(state.cart.map(i=>i.storeId)).size>1){toast('Faça um pedido por confeitaria.');return;}
    if(!state.user){hide('cartDrawer');openAuth('login');toast('Entre na sua conta para continuar.');return;}
    hide('cartDrawer'); $('#checkoutForm').reset(); $('#addressState').value='MG'; show('checkoutModal');
  }
  async function submitCheckout(ev) {
    ev.preventDefault(); if(!requireConfig())return;
    const btn=$('#checkoutForm button[type="submit"]'); btn.disabled=true; btn.textContent='Registrando pedido...';
    try {
      await getUser(); if(!state.user)throw new Error('Entre na sua conta para fazer um pedido.');
      // O cliente pode registrar novos pedidos sem esperar a atualização do status anterior.
      const storeId=state.cart[0].storeId, store=state.stores.find(s=>s.id===storeId); if(!store)throw new Error('A confeitaria não foi encontrada.');
      const phone=String(store.whatsapp_phone || '').replace(/\D/g,''); if(phone.length<10)throw new Error('A confeitaria ainda não cadastrou um WhatsApp válido. Entre em contato com a loja.');
      const addr={nome_destinatario:$('#addressName').value.trim(),telefone:$('#addressPhone').value.trim(),cep:$('#addressCep').value.trim(),rua:$('#addressStreet').value.trim(),numero:$('#addressNumber').value.trim(),complemento:$('#addressComplement').value.trim(),bairro:$('#addressNeighborhood').value.trim(),cidade:$('#addressCity').value.trim(),estado:$('#addressState').value.trim(),referencia:$('#addressReference').value.trim(),usuario_id:state.user.id};
      const {data:address,error:ae}=await client().from('enderecos').insert(addr).select().single(); if(ae)throw ae;
      const subtotal=state.cart.reduce((n,i)=>n+i.price*i.qty,0), delivery=Number(store.taxa_entrega||0), total=subtotal+delivery;
      const snapshot={...addr}; delete snapshot.usuario_id;
      const {data:order,error:oe}=await client().from('pedidos').insert({usuario_id:state.user.id,confeitaria_id:storeId,endereco_id:address.id,subtotal,entrega:delivery,total,endereco_snapshot:snapshot,status:'recebido'}).select().single(); if(oe)throw oe;
      const rows=state.cart.map(i=>({pedido_id:order.id,produto_id:i.productId,nome_produto:i.name,sabor:i.flavor||null,tamanho:i.size||null,quantidade:i.qty,preco_unitario:i.price,observacoes:i.observation||null}));
      const {error:ie}=await client().from('itens_pedido').insert(rows); if(ie){await client().from('pedidos').delete().eq('id',order.id);throw ie;}
      const lines=[`Olá! Quero confirmar o pedido ${order.codigo} no CandyHub Delivery.`,`Confeitaria: ${store.nome}`,'',...state.cart.map(i=>`• ${i.qty}x ${i.name}${i.flavor?' — '+i.flavor:''}${i.size?' ('+i.size+')':''} — ${money(i.price*i.qty)}${i.observation?' | Obs.: '+i.observation:''}`),'',`Subtotal: ${money(subtotal)}`,`Entrega: ${money(delivery)}`,`TOTAL: ${money(total)}`,'',`Recebedor: ${addr.nome_destinatario}`,`Telefone: ${addr.telefone}`,`Endereço: ${addr.rua}, ${addr.numero}${addr.complemento?', '+addr.complemento:''}, ${addr.bairro}, ${addr.cidade} - ${addr.estado}${addr.cep?' / CEP '+addr.cep:''}`,addr.referencia?`Referência: ${addr.referencia}`:''];
      state.cart=[]; updateCart(); hide('checkoutModal'); state.activeOrder=order; toast(`Pedido ${order.codigo} registrado! Abrindo WhatsApp...`); window.open(`https://wa.me/${phone}?text=${encodeURIComponent(lines.filter(Boolean).join('\n'))}`,'_blank','noopener');
    } catch(e){toast(`Não foi possível concluir: ${e.message||e}`);} finally {btn.disabled=false;btn.textContent='Registrar pedido e abrir WhatsApp';}
  }
  async function renderReviews() {
    const box=$('#reviewsList'); if(!state.activeStore||!box)return;
    try { const {data,error}=await client().from('avaliacoes').select('id,nota,comentario,created_at,usuario_id').eq('confeitaria_id',state.activeStore.id).order('created_at',{ascending:false}); if(error)throw error;
      const reviews=data||[]; box.innerHTML=reviews.length?reviews.map(r=>`<article class="review-item"><strong>${r.usuario_id===state.user?.id?'Você':'Cliente'}</strong> <span class="stars">${'★'.repeat(r.nota)}${'☆'.repeat(5-r.nota)}</span><p>${escapeHtml(r.comentario||'')}</p></article>`).join(''):'<div class="review-empty">Ainda não há avaliações.</div>';
    } catch(e){box.innerHTML='<div class="review-empty">As avaliações não puderam ser carregadas. Confira a configuração do banco.</div>';}
  }
  async function submitReview(ev) { ev.preventDefault(); if(!state.activeStore)return; if(!state.user){hide('storeModal');openAuth('login');toast('Entre na conta para avaliar.');return;} if(!state.reviewRating){toast('Escolha de 1 a 5 estrelas.');return;} try { const payload={usuario_id:state.user.id,confeitaria_id:state.activeStore.id,nota:state.reviewRating,comentario:$('#reviewText').value.trim()}; const {error}=await client().from('avaliacoes').upsert(payload,{onConflict:'usuario_id,confeitaria_id'}); if(error)throw error; $('#reviewText').value='';state.reviewRating=0;updateReviewStars();toast('Avaliação enviada!');await renderReviews(); }catch(e){toast(`Não foi possível enviar a avaliação: ${e.message||e}`);} }
  async function loadUserFavorites() {
    if (!state.user) return [];
    const {data,error}=await client().from('favoritos').select('id,confeitaria_id').eq('usuario_id',state.user.id).order('created_at',{ascending:false});
    if(error)throw error;
    return data||[];
  }
  async function updateFavoriteButton() { const b=$('#favoriteBtn'); if(!b||!state.activeStore)return; if(!state.user){b.textContent='♡ Favoritar';return;} try {const {data}=await client().from('favoritos').select('id').eq('usuario_id',state.user.id).eq('confeitaria_id',state.activeStore.id).maybeSingle(); b.textContent=data?'♥ Favoritado':'♡ Favoritar';}catch{b.textContent='♡ Favoritar';} }
  async function toggleFavorite() { if(!state.user){hide('storeModal');openAuth('login');return;} try {const {data}=await client().from('favoritos').select('id').eq('usuario_id',state.user.id).eq('confeitaria_id',state.activeStore.id).maybeSingle(); if(data){const {error}=await client().from('favoritos').delete().eq('id',data.id);if(error)throw error;toast('Confeitaria removida dos favoritos.');}else{const {error}=await client().from('favoritos').insert({usuario_id:state.user.id,confeitaria_id:state.activeStore.id});if(error)throw error;toast('Confeitaria adicionada aos favoritos.');}await updateFavoriteButton();}catch(e){toast(`Não foi possível atualizar favoritos: ${e.message||e}`);} }
  async function removeAccountFavorite(favoriteId) {
    try {
      const {error}=await client().from('favoritos').delete().eq('id',favoriteId).eq('usuario_id',state.user.id);
      if(error)throw error;
      toast('Confeitaria removida dos favoritos.');
      await openAccount();
    } catch(e) { toast(`Não foi possível remover dos favoritos: ${e.message||e}`); }
  }
  function updateReviewStars(){ $$('#reviewStars button').forEach(b=>b.classList.toggle('selected',Number(b.dataset.rating)<=state.reviewRating)); }
  async function login(ev) { ev.preventDefault(); if(!requireConfig())return; showMessage('authMsg','Entrando...'); try {const {data,error}=await client().auth.signInWithPassword({email:$('#loginEmail').value.trim(),password:$('#loginSenha').value});if(error)throw error;state.user=data.user;await loadProfile();setAuthButton();hide('authModal');toast('Login realizado com sucesso!');await loadData();}catch(e){showMessage('authMsg',e.message||'Não foi possível entrar.',true);} }
  async function signup(ev) { ev.preventDefault(); if(!requireConfig())return; if($('#cadSenha').value!==$('#cadSenha2').value){showMessage('authMsg','As senhas não são iguais.',true);return;} showMessage('authMsg','Criando sua conta...'); try {const nome=$('#cadNome').value.trim(),email=$('#cadEmail').value.trim(),password=$('#cadSenha').value;const {data,error}=await client().auth.signUp({email,password,options:{data:{nome}}});if(error)throw error;if(data.user){await client().from('perfis').upsert({id:data.user.id,nome,email},{onConflict:'id'});} if(data.session){state.user=data.user;await loadProfile();setAuthButton();hide('authModal');toast('Conta criada com sucesso!');await loadData();}else{showMessage('authMsg','Cadastro criado! Verifique seu e-mail para confirmar a conta e depois entre.');activateTab('login');}}catch(e){showMessage('authMsg',e.message||'Não foi possível criar a conta.',true);} }
  async function logout() { try {const {error}=await client().auth.signOut();if(error)throw error;state.user=null;state.profile=null;state.activeOrder=null;setAuthButton();hide('accountModal');toast('Você saiu da conta.');await loadData();}catch(e){toast(`Erro ao sair: ${e.message||e}`);} }
  function closeAll() { $$('.modal.open, .drawer.open').forEach(el=>hide(el)); }
  function bind() {
    $('#year').textContent=new Date().getFullYear();
    $('#accountBtn').addEventListener('click',()=>openAccount().catch(e=>toast(e.message||e)));
    $('#partnerBtn').addEventListener('click',()=>state.user?openManage():openAuth('cadastro'));
    $('#myStoreBtn').addEventListener('click',()=>{hide('accountModal');openManage();}); $('#logoutBtn').addEventListener('click',logout);
    $('#accountContent').addEventListener('click',e=>{const openBtn=e.target.closest('[data-open-favorite]'),removeBtn=e.target.closest('[data-remove-favorite]');if(openBtn){hide('accountModal');openStore(openBtn.dataset.openFavorite);}if(removeBtn)removeAccountFavorite(removeBtn.dataset.removeFavorite);});
    $('#cartBtn').addEventListener('click',()=>{updateCart();show('cartDrawer');}); $('#closeCart').addEventListener('click',()=>hide('cartDrawer'));
    $('#closeAuth').addEventListener('click',()=>hide('authModal')); $('#closeAccount').addEventListener('click',()=>hide('accountModal')); $('#closeManage').addEventListener('click',()=>hide('manageModal')); $('#closeProductManage').addEventListener('click',()=>hide('productManageModal')); $('#closeStoreModal').addEventListener('click',()=>hide('storeModal')); $('#closeProductModal').addEventListener('click',()=>hide('productModal')); $('#closeCheckout').addEventListener('click',()=>hide('checkoutModal'));
    $('#overlay').addEventListener('click',closeAll); document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAll();});
    $('#hamburgerBtn').addEventListener('click',()=>$('#mainNav').classList.toggle('open')); $$('#mainNav a').forEach(a=>a.addEventListener('click',()=>$('#mainNav').classList.remove('open')));
    $$('.tab-btn').forEach(b=>b.addEventListener('click',()=>activateTab(b.dataset.tab))); $('#loginForm').addEventListener('submit',login); $('#cadastroForm').addEventListener('submit',signup);
    $('#storeForm').addEventListener('submit',saveStore); $('#productForm').addEventListener('submit',saveProduct); $('#newProductBtn').addEventListener('click',()=>openNewProduct()); $('#checkoutForm').addEventListener('submit',submitCheckout); $('#confirmProductOption').addEventListener('click',addToCart);
    $('#searchInput').addEventListener('input',()=>{renderStores();renderProducts();});
    $$('#quickCats [data-cat]').forEach(b=>b.addEventListener('click',()=>{state.category=b.dataset.cat;state.storeCategory=b.dataset.cat;$$('#quickCats button').forEach(x=>x.classList.toggle('active',x===b));$$('.store-filter').forEach(x=>x.classList.toggle('active',x.dataset.filter===state.storeCategory));renderStores();renderProducts();}));
    $$('.store-filter').forEach(b=>b.addEventListener('click',()=>{state.storeCategory=b.dataset.filter;$$('.store-filter').forEach(x=>x.classList.toggle('active',x===b));renderStores();}));
    $('#storesGrid').addEventListener('click',e=>{const b=e.target.closest('[data-store-id]');if(b)openStore(b.dataset.storeId);});
    const productClick=e=>{const c=e.target.closest('[data-product-id]');if(c)openProduct(c.dataset.productId);}; $('#featuredGrid').addEventListener('click',productClick); $('#storeProductsGrid').addEventListener('click',productClick); $('#featuredGrid').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const c=e.target.closest('[data-product-id]');if(c){e.preventDefault();openProduct(c.dataset.productId);}}}); $('#storeProductsGrid').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const c=e.target.closest('[data-product-id]');if(c){e.preventDefault();openProduct(c.dataset.productId);}}});
    $('#storeMenuTabs').addEventListener('click',e=>{const b=e.target.closest('[data-store-cat]');if(b){state.currentStoreCategory=b.dataset.storeCat;renderStoreModal();}});
    $('#flavorOptions').addEventListener('click',e=>{const b=e.target.closest('[data-flavor]');if(!b)return;state.selectedFlavor=b.dataset.flavor;$$('#flavorOptions .option').forEach(x=>x.classList.toggle('selected',x===b));});
    $('#sizeOptions').addEventListener('click',e=>{const b=e.target.closest('[data-size]');if(!b)return;state.selectedSize=b.dataset.size;state.selectedPrice=Number(b.dataset.price);$$('#sizeOptions .option').forEach(x=>x.classList.toggle('selected',x===b));$('#productModalPrice').textContent=money(state.selectedPrice);});
    $('#cartItemsWrap').addEventListener('click',e=>{const rm=e.target.closest('[data-remove-cart]');if(rm){state.cart.splice(Number(rm.dataset.removeCart),1);updateCart();return;}const q=e.target.closest('[data-qty]');if(q){const item=state.cart[Number(q.dataset.index)];if(item){item.qty+=Number(q.dataset.qty);if(item.qty<1)state.cart.splice(Number(q.dataset.index),1);updateCart();}}}); $('#cartFoot').addEventListener('click',e=>{if(e.target.closest('#checkoutBtn'))beginCheckout();});
    $('#myProductsList').addEventListener('click',async e=>{const edit=e.target.closest('[data-edit-product]'),del=e.target.closest('[data-delete-product]');if(edit){const p=state.products.find(x=>x.id===edit.dataset.editProduct)||await (async()=>{const {data}=await client().from('produtos').select('*').eq('id',edit.dataset.editProduct).single();return data;})();openNewProduct(p);}if(del)deleteProduct(del.dataset.deleteProduct);});
    $('#reviewForm').addEventListener('submit',submitReview); $('#reviewStars').addEventListener('click',e=>{const b=e.target.closest('[data-rating]');if(b){state.reviewRating=Number(b.dataset.rating);updateReviewStars();}}); $('#favoriteBtn').addEventListener('click',toggleFavorite);
  }
  async function init() {
    bind();
    if (!window.supabaseClient) { toast('Atenção: falta a chave pública do Supabase em supabase-config.js. Os botões estão ativos, mas o banco precisa dessa chave para login e cadastros.'); renderStores();renderProducts();return; }
    try {const {data}=await client().auth.getSession();state.user=data.session?.user||null;if(state.user)await loadProfile();setAuthButton();await loadData();} catch(e){toast(`Falha ao iniciar o site: ${e.message||e}`);}
    client().auth.onAuthStateChange(async(_event,session)=>{state.user=session?.user||null;try{if(state.user)await loadProfile();else state.profile=null;setAuthButton();}catch{} });
  }
  document.addEventListener('DOMContentLoaded',init);
})();
