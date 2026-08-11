const $=id=>document.getElementById(id);
const STORAGE='mcProjetos_v2';
const CLOUD_ACTIVE_KEY='mcProjetos_cloud_active';
let db=JSON.parse(localStorage.getItem(STORAGE)||'{"clientes":[],"projetos":[],"pagamentos":[]}');
let supabaseClient=null;
let usuarioNuvem=null;
let nuvemAtiva=localStorage.getItem(CLOUD_ACTIVE_KEY)==='1';
let syncTimer=null;
let sincronizando=false;
const moeda=n=>(Number(n)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const num=v=>Number(String(v||'0').replace(/\./g,'').replace(',','.'))||0;
// Números decimais simples (percentual, hectares): aceita 0,75 e 0.75.
const decimal=v=>{
  let texto=String(v??'').trim().replace(/%/g,'').replace(/\s/g,'');
  if(!texto)return 0;
  if(texto.includes(',')) texto=texto.replace(/\./g,'').replace(',','.');
  return Number(texto)||0;
};
const hoje=()=>{const d=new Date(),pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
const uid=()=>Date.now()+Math.floor(Math.random()*999);
function salvar(){
  localStorage.setItem(STORAGE,JSON.stringify(db));
  renderTudo();
  if(nuvemAtiva&&usuarioNuvem)agendarSyncNuvem();
}
function clienteNome(id){return db.clientes.find(c=>c.id===id)?.nome||'Cliente removido'}
function recebido(p){return db.pagamentos.filter(x=>x.projetoId===p.id).reduce((s,x)=>s+x.valor,0)}
function saldo(p){return Math.max(0,p.valor-recebido(p))}
function statusPg(p){const r=recebido(p);return r<=0?'pendente':r+0.005>=p.valor?'pago':'parcial'}
function statusTexto(s){return s==='pago'?'Pago':s==='parcial'?'Parcial':'Pendente'}
function tipoTexto(t){return t==='investimento'?'Projeto de Investimento':t==='custeio'?'Projeto de Custeio':'Agricultura de Precisão'}
function formatarEntrada(el){el.addEventListener('input',()=>{let d=el.value.replace(/\D/g,'');el.value=d?(Number(d)/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):'';calcularProjeto()})}
['projetoValorFinanciado','projetoValorHa','projetoRecebidoInicial','pagamentoValor'].forEach(id=>formatarEntrada($(id)));
['editProjetoValorFinanciado','editProjetoValorHa'].forEach(id=>{const el=$(id);if(el)formatarEntrada(el)});
function calcularProjeto(){let v=0;if($('projetoTipo').value==='ap')v=decimal($('projetoArea').value)*num($('projetoValorHa').value);else v=num($('projetoValorFinanciado').value)*(decimal($('projetoPercentual').value)/100);$('valorCalculado').textContent=moeda(v);return v}
function alternarCampos(){const ap=$('projetoTipo').value==='ap';$('camposAp').classList.toggle('oculto',!ap);$('camposPercentual').classList.toggle('oculto',ap);calcularProjeto()}
function calcularProjetoEdit(){let v=0;if(!$('editProjetoTipo'))return 0;if($('editProjetoTipo').value==='ap')v=decimal($('editProjetoArea').value)*num($('editProjetoValorHa').value);else v=num($('editProjetoValorFinanciado').value)*(decimal($('editProjetoPercentual').value)/100);$('editValorCalculado').textContent=moeda(v);return v}
function alternarCamposEdit(){if(!$('editProjetoTipo'))return;const ap=$('editProjetoTipo').value==='ap';$('editCamposAp').classList.toggle('oculto',!ap);$('editCamposPercentual').classList.toggle('oculto',ap);calcularProjetoEdit()}
function renderSelectClientes(){
  const clientesOrdenados=db.clientes.slice().sort((a,b)=>a.nome.localeCompare(b.nome));
  const atualProjeto=$('projetoCliente').value;
  $('projetoCliente').innerHTML='<option value="">Selecione o cliente</option>'+clientesOrdenados.map(c=>`<option value="${c.id}">${c.nome}</option>`).join('');
  $('projetoCliente').value=atualProjeto;
  if($('editProjetoCliente')){const atualEdit=$('editProjetoCliente').value;$('editProjetoCliente').innerHTML='<option value="">Selecione o cliente</option>'+clientesOrdenados.map(c=>`<option value="${c.id}">${c.nome}</option>`).join('');if(atualEdit)$('editProjetoCliente').value=atualEdit;}
  const atualExtrato=$('extratoCliente')?.value||'todos';
  if($('extratoCliente')){
    $('extratoCliente').innerHTML='<option value="todos">Todos os clientes</option>'+clientesOrdenados.map(c=>`<option value="${c.id}">${c.nome}</option>`).join('');
    $('extratoCliente').value=clientesOrdenados.some(c=>String(c.id)===String(atualExtrato))?atualExtrato:'todos';
  }
}
function renderDashboard(){const total=db.projetos.reduce((s,p)=>s+p.valor,0),rec=db.projetos.reduce((s,p)=>s+recebido(p),0);$('kpiClientes').textContent=db.clientes.length;$('kpiProjetos').textContent=db.projetos.length;$('kpiRecebido').textContent=moeda(rec);$('kpiReceber').textContent=moeda(Math.max(0,total-rec));$('kpiPagos').textContent=db.projetos.filter(p=>statusPg(p)==='pago').length;$('kpiPendentes').textContent=db.projetos.filter(p=>statusPg(p)!=='pago').length;
const ult=db.projetos.slice().sort((a,b)=>b.id-a.id).slice(0,5);$('ultimosProjetos').innerHTML=ult.length?ult.map(p=>`<div class="resumo-item"><span><strong>${p.nome}</strong><br><small>${clienteNome(p.clienteId)}</small></span><strong>${moeda(p.valor)}</strong></div>`).join(''):'Nenhum projeto cadastrado.';
const cats=['investimento','custeio','ap'].map(t=>[tipoTexto(t),db.projetos.filter(p=>p.tipo===t).reduce((s,p)=>s+p.valor,0)]).filter(x=>x[1]>0);$('resumoCategorias').innerHTML=cats.length?cats.map(x=>`<div class="resumo-item"><span>${x[0]}</span><strong>${moeda(x[1])}</strong></div>`).join(''):'Nenhum valor cadastrado.'}
function filtrosProjeto(p){const q=$('pesquisaGeral').value.toLowerCase().trim(),ft=$('filtroTipo').value,fp=$('filtroPagamento').value;return(!q||`${p.nome} ${clienteNome(p.clienteId)} ${tipoTexto(p.tipo)}`.toLowerCase().includes(q))&&(ft==='todos'||p.tipo===ft)&&(fp==='todos'||statusPg(p)===fp)}
function renderProjetos(){const arr=db.projetos.filter(filtrosProjeto).sort((a,b)=>b.id-a.id);$('listaProjetos').innerHTML=arr.length?arr.map(p=>{const st=statusPg(p);return `<article class="projeto-card"><div class="item-linha"><div class="conteudo"><strong>${p.nome}</strong><div class="meta">${clienteNome(p.clienteId)} • ${tipoTexto(p.tipo)}<br>Total: <b>${moeda(p.valor)}</b> • Recebido: ${moeda(recebido(p))}<br><span class="valor-total">Falta: ${moeda(saldo(p))}</span></div><span class="status status-${st}">${statusTexto(st)}</span></div><div class="botoes-item"><button class="btn-detalhes" onclick="detalhesProjeto(${p.id})">Detalhes</button><button class="btn-editar" onclick="editarProjeto(${p.id})">Editar</button>${st!=='pago'?`<button class="btn-pagar" onclick="abrirPagamento(${p.id})">Pagamento</button>`:''}<button class="btn-excluir" onclick="excluirProjeto(${p.id})">Apagar</button></div></div></article>`}).join(''):'Nenhum projeto encontrado.'}
function cardCliente(c){const ps=db.projetos.filter(p=>p.clienteId===c.id),total=ps.reduce((s,p)=>s+p.valor,0),pago=ps.reduce((s,p)=>s+recebido(p),0),pendente=Math.max(0,total-pago);return `<article class="cliente-card"><div class="item-linha"><div class="conteudo"><strong>${c.nome}</strong><div class="meta">${c.telefone||'Sem telefone'}${c.cidade?' • '+c.cidade:''}<br>${ps.length} projeto(s) • Total: <b>${moeda(total)}</b><br>Pago: ${moeda(pago)} • <span class="valor-total">Pendente: ${moeda(pendente)}</span></div></div><div class="botoes-item"><button class="btn-detalhes" onclick="abrirCliente(${c.id})">Abrir cliente</button><button class="btn-pdf" onclick="pdfCliente(${c.id})">PDF</button><button class="btn-editar" onclick="editarCliente(${c.id})">Editar</button><button class="btn-excluir" onclick="excluirCliente(${c.id})">Apagar</button></div></div></article>`}
function renderClientes(){const qGeral=$('pesquisaGeral')?.value.toLowerCase().trim()||'',qClientes=$('pesquisaClientes')?.value.toLowerCase().trim()||'';const ordenar=arr=>arr.sort((a,b)=>a.nome.localeCompare(b.nome));const arrPagina=ordenar(db.clientes.filter(c=>!qClientes||`${c.nome} ${c.telefone} ${c.cidade}`.toLowerCase().includes(qClientes)));const arrConsulta=ordenar(db.clientes.filter(c=>!qGeral||`${c.nome} ${c.telefone} ${c.cidade}`.toLowerCase().includes(qGeral)));if($('listaClientes'))$('listaClientes').innerHTML=arrPagina.length?arrPagina.map(cardCliente).join(''):'Nenhum cliente encontrado.';if($('listaClientesConsulta'))$('listaClientesConsulta').innerHTML=arrConsulta.length?arrConsulta.map(cardCliente).join(''):'Nenhum cliente encontrado.'}
function projetosDoExtrato(){const valor=$('extratoCliente')?.value||'todos';return db.projetos.filter(p=>valor==='todos'||String(p.clienteId)===valor).sort((a,b)=>(b.data||'').localeCompare(a.data||'')||b.id-a.id)}
function dadosExtrato(){const projetos=projetosDoExtrato(),total=projetos.reduce((s,p)=>s+p.valor,0),pago=projetos.reduce((s,p)=>s+recebido(p),0),pendente=Math.max(0,total-pago),selecao=$('extratoCliente')?.value||'todos',cliente=selecao==='todos'?null:db.clientes.find(c=>String(c.id)===selecao);return{projetos,total,pago,pendente,cliente,selecao}}
function dataBr(data){if(!data)return'-';return new Date(data+'T12:00:00').toLocaleDateString('pt-BR')}
function renderExtrato(){
  if(!$('extratoPreview'))return;
  const d=dadosExtrato(),titulo=d.cliente?`Extrato de ${d.cliente.nome}`:'Extrato geral de clientes';
  const linhas=d.projetos.map(p=>`<tr>
    <td>${dataBr(p.data)}</td><td>${clienteNome(p.clienteId)}</td><td>${p.nome}</td><td>${tipoTexto(p.tipo)}</td>
    <td>${moeda(p.valor)}</td><td>${moeda(recebido(p))}</td><td>${moeda(saldo(p))}</td><td>${statusTexto(statusPg(p))}</td>
    <td class="acoes-extrato"><button class="btn-mini btn-detalhes" onclick="detalhesProjeto(${p.id})">Detalhes</button><button class="btn-mini btn-editar" onclick="editarProjeto(${p.id})">Editar</button>${statusPg(p)!=='pago'?`<button class="btn-mini btn-pagar" onclick="abrirPagamento(${p.id})">Pagamento</button>`:''}</td>
  </tr>`).join('');
  $('extratoPreview').innerHTML=`<div class="extrato-cabecalho"><div><h3>${titulo}</h3><p>${d.cliente?[d.cliente.telefone,d.cliente.cidade].filter(Boolean).join(' • ')||'Cliente cadastrado':'Todos os clientes e projetos cadastrados'}</p></div><strong>${new Date().toLocaleDateString('pt-BR')}</strong></div><div class="extrato-resumo"><div><span>Projetos</span><strong>${d.projetos.length}</strong></div><div><span>Valor total</span><strong>${moeda(d.total)}</strong></div><div><span>Total pago</span><strong>${moeda(d.pago)}</strong></div><div><span>Saldo pendente</span><strong>${moeda(d.pendente)}</strong></div></div>${d.projetos.length?`<table class="tabela-extrato"><thead><tr><th>Data</th><th>Cliente</th><th>Projeto</th><th>Tipo</th><th>Valor</th><th>Pago</th><th>Pendente</th><th>Status</th><th>Ações</th></tr></thead><tbody>${linhas}</tbody></table>`:'<div class="extrato-vazio">Nenhum projeto encontrado para este extrato.</div>'}<div class="extrato-rodape">Extrato gerado em ${new Date().toLocaleString('pt-BR')}</div>`;
}
function htmlExtratoImpressao(){const d=dadosExtrato(),titulo=d.cliente?`Extrato de ${d.cliente.nome}`:'Extrato geral de clientes',logo=new URL('logo.png',location.href).href,linhas=d.projetos.map(p=>`<tr><td>${dataBr(p.data)}</td><td>${clienteNome(p.clienteId)}</td><td>${p.nome}</td><td>${tipoTexto(p.tipo)}</td><td>${moeda(p.valor)}</td><td>${moeda(recebido(p))}</td><td>${moeda(saldo(p))}</td><td>${statusTexto(statusPg(p))}</td></tr>`).join('');return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${titulo}</title><style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172033;margin:28px}header{border-bottom:3px solid #2f7d32;padding-bottom:14px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:center}header img{width:260px;max-height:90px;object-fit:contain;object-position:left}.meta{text-align:right;color:#596273}h1{font-size:24px;margin:0 0 5px}.resumo{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:16px 0}.resumo div{border:1px solid #dfe7df;border-radius:8px;padding:10px}.resumo span{display:block;font-size:11px;color:#6b7280;font-weight:bold}.resumo strong{display:block;margin-top:5px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{text-align:left;border:1px solid #dfe7df;padding:7px}th{background:#eaf6e9}footer{margin-top:18px;text-align:right;color:#6b7280;font-size:11px}@page{size:A4 landscape;margin:12mm}@media print{body{margin:0}}</style></head><body><header><img src="${logo}" alt="MC Projetos"><div class="meta"><h1>${titulo}</h1><div>${d.cliente?[d.cliente.telefone,d.cliente.cidade].filter(Boolean).join(' • ')||'Cliente cadastrado':'Relatório completo'}</div><div>Gerado em ${new Date().toLocaleString('pt-BR')}</div></div></header><section class="resumo"><div><span>PROJETOS</span><strong>${d.projetos.length}</strong></div><div><span>VALOR TOTAL</span><strong>${moeda(d.total)}</strong></div><div><span>TOTAL PAGO</span><strong>${moeda(d.pago)}</strong></div><div><span>SALDO PENDENTE</span><strong>${moeda(d.pendente)}</strong></div></section>${d.projetos.length?`<table><thead><tr><th>Data</th><th>Cliente</th><th>Projeto</th><th>Tipo</th><th>Valor</th><th>Pago</th><th>Pendente</th><th>Status</th></tr></thead><tbody>${linhas}</tbody></table>`:'<p>Nenhum projeto encontrado.</p>'}<footer>MC Projetos • Agricultura de Precisão</footer><script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`}
function imprimirExtrato(){const janela=window.open('','_blank');if(!janela)return alert('O navegador bloqueou a janela de impressão. Permita pop-ups e tente novamente.');janela.document.open();janela.document.write(htmlExtratoImpressao());janela.document.close()}
function selecionarClienteExtrato(id){$('extratoCliente').value=String(id);renderExtrato()}
window.abrirCliente=id=>{selecionarClienteExtrato(id);fecharPaginaClientes();$('paginaExtrato').classList.add('ativo');$('paginaExtrato').setAttribute('aria-hidden','false');document.body.classList.add('sem-rolagem')};
window.pdfCliente=id=>{selecionarClienteExtrato(id);imprimirExtrato()};
function exportarCsvExtrato(){const d=dadosExtrato(),rows=[['Data','Cliente','Projeto','Tipo','Valor','Pago','Pendente','Status'],...d.projetos.map(p=>[p.data,clienteNome(p.clienteId),p.nome,tipoTexto(p.tipo),p.valor,recebido(p),saldo(p),statusTexto(statusPg(p))])];const csv='\uFEFF'+rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';')).join('\n'),a=document.createElement('a'),nome=d.cliente?d.cliente.nome.toLowerCase().replace(/[^a-z0-9]+/gi,'-'):'geral';a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=`extrato-${nome}-${hoje()}.csv`;a.click();URL.revokeObjectURL(a.href)}
function renderTudo(){renderSelectClientes();renderDashboard();renderProjetos();renderClientes();renderExtrato()}
$('dataHoje').textContent=new Date().toLocaleDateString('pt-BR',{dateStyle:'long'});
$('projetoData').value=hoje();$('pagamentoData').value=hoje();$('projetoTipo').addEventListener('change',alternarCampos);['projetoArea','projetoPercentual'].forEach(id=>$(id).addEventListener('input',calcularProjeto));
$('formCliente').addEventListener('submit',e=>{e.preventDefault();const id=Number($('clienteId').value);const obj={id:id||uid(),nome:$('clienteNome').value.trim(),telefone:$('clienteTelefone').value.trim(),documento:$('clienteDocumento').value.trim(),cidade:$('clienteCidade').value.trim(),obs:$('clienteObs').value.trim()};if(id)db.clientes=db.clientes.map(c=>c.id===id?obj:c);else db.clientes.push(obj);e.target.reset();$('clienteId').value='';$('btnSalvarCliente').textContent='Registrar cliente';$('btnCancelarCliente').classList.add('oculto');salvar()});
$('btnCancelarCliente').onclick=()=>{$('formCliente').reset();$('clienteId').value='';$('btnSalvarCliente').textContent='Registrar cliente';$('btnCancelarCliente').classList.add('oculto')};
window.editarCliente=id=>{fecharConsultaRapida();fecharPaginaClientes();const c=db.clientes.find(x=>x.id===id);if(!c)return;$('clienteId').value=c.id;$('clienteNome').value=c.nome;$('clienteTelefone').value=c.telefone;$('clienteDocumento').value=c.documento;$('clienteCidade').value=c.cidade;$('clienteObs').value=c.obs;$('btnSalvarCliente').textContent='Salvar alterações';$('btnCancelarCliente').classList.remove('oculto');$('formCliente').scrollIntoView({behavior:'smooth'})};
window.excluirCliente=id=>{if(db.projetos.some(p=>p.clienteId===id))return alert('Apague primeiro os projetos desse cliente.');if(confirm('Apagar este cliente?')){db.clientes=db.clientes.filter(c=>c.id!==id);salvar()}};
$('formProjeto').addEventListener('submit',e=>{e.preventDefault();const valor=calcularProjeto();if(valor<=0)return alert('Informe os valores do cálculo.');const id=Number($('projetoId').value);const obj={id:id||uid(),clienteId:Number($('projetoCliente').value),tipo:$('projetoTipo').value,nome:$('projetoNome').value.trim(),data:$('projetoData').value,valor,valorFinanciado:num($('projetoValorFinanciado').value),percentual:decimal($('projetoPercentual').value),area:decimal($('projetoArea').value),valorHa:num($('projetoValorHa').value),status:$('projetoStatus').value,obs:$('projetoObs').value.trim()};if(id)db.projetos=db.projetos.map(p=>p.id===id?obj:p);else{db.projetos.push(obj);const inicial=num($('projetoRecebidoInicial').value);if(inicial>0)db.pagamentos.push({id:uid(),projetoId:obj.id,valor:Math.min(inicial,valor),data:obj.data,forma:'Inicial',obs:'Valor recebido no cadastro'})}e.target.reset();$('projetoData').value=hoje();$('projetoTipo').value='investimento';$('projetoId').value='';$('btnSalvarProjeto').textContent='Salvar projeto';$('btnCancelarProjeto').classList.add('oculto');alternarCampos();salvar()});
$('btnCancelarProjeto').onclick=()=>{$('formProjeto').reset();$('projetoData').value=hoje();$('projetoId').value='';$('btnSalvarProjeto').textContent='Salvar projeto';$('btnCancelarProjeto').classList.add('oculto');alternarCampos()};
window.editarProjeto=id=>{
  const p=db.projetos.find(x=>x.id===id);if(!p)return alert('Projeto não encontrado.');
  renderSelectClientes();
  $('editProjetoId').value=p.id;
  $('editProjetoCliente').value=String(p.clienteId);
  $('editProjetoTipo').value=p.tipo;
  $('editProjetoNome').value=p.nome||'';
  $('editProjetoData').value=p.data||hoje();
  $('editProjetoValorFinanciado').value=p.valorFinanciado?p.valorFinanciado.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):'';
  $('editProjetoPercentual').value=p.percentual?String(p.percentual).replace('.',','):'';
  $('editProjetoArea').value=p.area||'';
  $('editProjetoValorHa').value=p.valorHa?p.valorHa.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):'';
  $('editProjetoStatus').value=p.status||'em_andamento';
  $('editProjetoObs').value=p.obs||'';
  alternarCamposEdit();
  $('modalEditarProjeto').classList.add('ativo');
  $('modalEditarProjeto').setAttribute('aria-hidden','false');
};

if($('editProjetoTipo'))$('editProjetoTipo').addEventListener('change',alternarCamposEdit);
['editProjetoArea','editProjetoPercentual','editProjetoValorFinanciado','editProjetoValorHa'].forEach(id=>{if($(id))$(id).addEventListener('input',calcularProjetoEdit)});
if($('formEditarProjeto'))$('formEditarProjeto').addEventListener('submit',e=>{
  e.preventDefault();
  const id=Number($('editProjetoId').value),antigo=db.projetos.find(x=>x.id===id);if(!antigo)return alert('Projeto não encontrado.');
  const valor=calcularProjetoEdit();if(valor<=0)return alert('Informe os valores do cálculo.');
  const atualizado={...antigo,clienteId:Number($('editProjetoCliente').value),tipo:$('editProjetoTipo').value,nome:$('editProjetoNome').value.trim(),data:$('editProjetoData').value,valor,valorFinanciado:num($('editProjetoValorFinanciado').value),percentual:decimal($('editProjetoPercentual').value),area:decimal($('editProjetoArea').value),valorHa:num($('editProjetoValorHa').value),status:$('editProjetoStatus').value,obs:$('editProjetoObs').value.trim()};
  if(recebido(atualizado)>valor+.01)return alert(`O novo valor do projeto (${moeda(valor)}) não pode ser menor que o total já recebido (${moeda(recebido(atualizado))}).`);
  db.projetos=db.projetos.map(x=>x.id===id?atualizado:x);
  salvar();
  $('modalEditarProjeto').classList.remove('ativo');$('modalEditarProjeto').setAttribute('aria-hidden','true');
});

window.excluirProjeto=id=>{if(confirm('Apagar este projeto e todos os pagamentos dele?')){db.projetos=db.projetos.filter(p=>p.id!==id);db.pagamentos=db.pagamentos.filter(x=>x.projetoId!==id);salvar()}};
window.abrirPagamento=id=>{const p=db.projetos.find(x=>x.id===id);$('pagamentoProjetoId').value=id;$('pagamentoProjetoNome').textContent=`${p.nome} — falta ${moeda(saldo(p))}`;$('pagamentoValor').value='';$('pagamentoData').value=hoje();$('modalPagamento').classList.add('ativo');$('modalPagamento').setAttribute('aria-hidden','false')};
$('formPagamento').addEventListener('submit',e=>{e.preventDefault();const id=Number($('pagamentoProjetoId').value),p=db.projetos.find(x=>x.id===id),v=num($('pagamentoValor').value);if(v<=0)return alert('Informe o valor.');if(v>saldo(p)+.01)return alert('O pagamento é maior que o saldo pendente.');db.pagamentos.push({id:uid(),projetoId:id,valor:v,data:$('pagamentoData').value,forma:$('pagamentoForma').value,obs:$('pagamentoObs').value.trim()});$('modalPagamento').classList.remove('ativo');$('modalPagamento').setAttribute('aria-hidden','true');e.target.reset();salvar()});
window.detalhesProjeto=id=>{
  const p=db.projetos.find(x=>x.id===id);if(!p)return alert('Projeto não encontrado.');
  const pgs=db.pagamentos.filter(x=>x.projetoId===id).sort((a,b)=>b.id-a.id),st=statusPg(p);
  $('detalheTitulo').textContent=p.nome;
  $('detalheConteudo').innerHTML=`
    <div class="detalhe-grid">
      <div class="detalhe-box"><span>Cliente</span><strong>${clienteNome(p.clienteId)}</strong></div>
      <div class="detalhe-box"><span>Tipo</span><strong>${tipoTexto(p.tipo)}</strong></div>
      <div class="detalhe-box"><span>Data</span><strong>${dataBr(p.data)}</strong></div>
      <div class="detalhe-box"><span>Status financeiro</span><strong>${statusTexto(st)}</strong></div>
      <div class="detalhe-box"><span>Valor total</span><strong>${moeda(p.valor)}</strong></div>
      <div class="detalhe-box"><span>Total recebido</span><strong>${moeda(recebido(p))}</strong></div>
      <div class="detalhe-box"><span>Saldo pendente</span><strong>${moeda(saldo(p))}</strong></div>
      <div class="detalhe-box"><span>Status do projeto</span><strong>${(p.status||'').replace('_',' ')||'-'}</strong></div>
    </div>
    ${p.obs?`<div class="detalhe-observacao"><strong>Observações</strong><p>${p.obs}</p></div>`:''}
    <div class="detalhe-acoes"><button class="btn-editar" onclick="document.getElementById('modalDetalhes').classList.remove('ativo');editarProjeto(${p.id})">Editar projeto</button>${st!=='pago'?`<button class="btn-pagar" onclick="document.getElementById('modalDetalhes').classList.remove('ativo');abrirPagamento(${p.id})">Registrar pagamento</button>`:''}</div>
    <h3 style="margin:18px 0 8px">Pagamentos</h3>
    ${pgs.length?pgs.map(x=>`<div class="pagamento-item"><strong>${moeda(x.valor)}</strong> • ${dataBr(x.data)} • ${x.forma}${x.obs?`<br><small>${x.obs}</small>`:''}</div>`).join(''):'Nenhum pagamento registrado.'}`;
  $('modalDetalhes').classList.add('ativo');$('modalDetalhes').setAttribute('aria-hidden','false');
};

document.querySelectorAll('[data-fechar]').forEach(b=>b.onclick=()=>{const m=$(b.dataset.fechar);if(m){m.classList.remove('ativo');m.setAttribute('aria-hidden','true')}});document.querySelectorAll('.modal').forEach(m=>m.onclick=e=>{if(e.target===m){m.classList.remove('ativo');m.setAttribute('aria-hidden','true')}});
['pesquisaGeral','filtroTipo','filtroPagamento'].forEach(id=>$(id).addEventListener(id==='pesquisaGeral'?'input':'change',()=>{renderProjetos();renderClientes()}));$('btnLimparFiltros').onclick=()=>{$('pesquisaGeral').value='';$('filtroTipo').value='todos';$('filtroPagamento').value='todos';renderProjetos();renderClientes()};
function fecharConsultaRapida(){if(!$('paginaConsulta'))return;$('paginaConsulta').classList.remove('ativo');$('paginaConsulta').setAttribute('aria-hidden','true');document.body.classList.remove('sem-rolagem')}
function fecharPaginaClientes(){if(!$('paginaClientes'))return;$('paginaClientes').classList.remove('ativo');$('paginaClientes').setAttribute('aria-hidden','true');document.body.classList.remove('sem-rolagem')}
$('btnAbrirClientes').onclick=()=>{renderClientes();$('paginaClientes').classList.add('ativo');$('paginaClientes').setAttribute('aria-hidden','false');document.body.classList.add('sem-rolagem');setTimeout(()=>$('pesquisaClientes').focus(),100)};
$('btnVoltarClientes').onclick=fecharPaginaClientes;
$('pesquisaClientes').addEventListener('input',renderClientes);
$('btnLimparPesquisaClientes').onclick=()=>{$('pesquisaClientes').value='';renderClientes()};
$('btnAbrirConsulta').onclick=()=>{renderProjetos();renderClientes();$('paginaConsulta').classList.add('ativo');$('paginaConsulta').setAttribute('aria-hidden','false');document.body.classList.add('sem-rolagem');setTimeout(()=>$('pesquisaGeral').focus(),100)};
$('btnVoltarConsulta').onclick=fecharConsultaRapida;
$('btnAbrirExtrato').onclick=()=>{renderExtrato();$('paginaExtrato').classList.add('ativo');$('paginaExtrato').setAttribute('aria-hidden','false');document.body.classList.add('sem-rolagem')};
$('btnVoltarExtrato').onclick=()=>{$('paginaExtrato').classList.remove('ativo');$('paginaExtrato').setAttribute('aria-hidden','true');document.body.classList.remove('sem-rolagem')};
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;const modalAberto=[...document.querySelectorAll('.modal.ativo')].pop();if(modalAberto){modalAberto.classList.remove('ativo');modalAberto.setAttribute('aria-hidden','true');return;}if($('paginaClientes').classList.contains('ativo'))$('btnVoltarClientes').click();else if($('paginaConsulta').classList.contains('ativo'))$('btnVoltarConsulta').click();else if($('paginaExtrato').classList.contains('ativo'))$('btnVoltarExtrato').click()});
$('extratoCliente').addEventListener('change',renderExtrato);
$('btnGerarExtrato').onclick=renderExtrato;
$('btnPdfExtrato').onclick=imprimirExtrato;
$('btnCsvExtrato').onclick=exportarCsvExtrato;
$('btnBackup').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(db,null,2)],{type:'application/json'}));a.download=`mc-projetos-backup-${hoje()}.json`;a.click();URL.revokeObjectURL(a.href)};
$('inputImportar').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);if(!d.clientes||!d.projetos||!d.pagamentos)throw 0;if(confirm('Substituir os dados atuais pelo backup?')){db=d;salvar()}}catch{alert('Backup inválido.')}};r.readAsText(f)};
$('btnExcel').onclick=()=>{const rows=[['Cliente','Projeto','Tipo','Valor','Recebido','Pendente','Status','Data'],...db.projetos.map(p=>[clienteNome(p.clienteId),p.nome,tipoTexto(p.tipo),p.valor,recebido(p),saldo(p),statusTexto(statusPg(p)),p.data])];const csv='\uFEFF'+rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=`mc-projetos-${hoje()}.csv`;a.click();URL.revokeObjectURL(a.href)};
$('btnRelatorio').onclick=()=>window.print();

// ============================================================
// BANCO DE DADOS ONLINE — SUPABASE + LOGIN + OFFLINE FIRST
// O localStorage continua como cache offline e backup local.
// ============================================================
const OFFLINE_AUTH_KEY='mcProjetos_offline_auth_v1';
let inicializandoSupabase=false;
let modoOffline=false;

function configSupabaseValida(){
  const cfg=window.MC_SUPABASE_CONFIG||{};
  return !!(cfg.url&&cfg.publishableKey&&!cfg.url.includes('COLE_AQUI')&&!cfg.publishableKey.includes('COLE_AQUI'));
}
function authOfflineSalva(){
  try{return JSON.parse(localStorage.getItem(OFFLINE_AUTH_KEY)||'null')}catch{return null}
}
function salvarAutorizacaoOffline(user){
  if(!user?.email)return;
  localStorage.setItem(OFFLINE_AUTH_KEY,JSON.stringify({email:user.email,liberado:true,atualizadoEm:Date.now()}));
}
function limparAutorizacaoOffline(){localStorage.removeItem(OFFLINE_AUTH_KEY)}
function setLoginMensagem(texto='',tipo=''){
  const el=$('loginMensagem');if(!el)return;
  el.textContent=texto;el.className='login-mensagem'+(tipo?' '+tipo:'');
}
function setCadastroMensagem(texto='',tipo=''){
  const el=$('cadastroMensagem');if(!el)return;
  el.textContent=texto;el.className='login-mensagem'+(tipo?' '+tipo:'');
}
function setRecuperarMensagem(texto='',tipo=''){
  const el=$('recuperarMensagem');if(!el)return;
  el.textContent=texto;el.className='login-mensagem'+(tipo?' '+tipo:'');
}
function setNovaSenhaMensagem(texto='',tipo=''){
  const el=$('novaSenhaMensagem');if(!el)return;
  el.textContent=texto;el.className='login-mensagem'+(tipo?' '+tipo:'');
}
function mostrarBlocoLogin(nome='login'){
  ['loginNormal','cadastroConta','recuperarSenha','novaSenha'].forEach(id=>$(id)?.classList.add('oculto'));
  const mapa={login:'loginNormal',cadastro:'cadastroConta',recuperar:'recuperarSenha',nova:'novaSenha'};
  $(mapa[nome]||'loginNormal')?.classList.remove('oculto');
}
function mostrarTelaLogin(msg='',tipo=''){
  $('appShell')?.classList.add('oculto');
  $('telaLogin')?.classList.remove('oculto');
  document.body.classList.remove('sem-rolagem');
  mostrarBlocoLogin('login');
  setLoginMensagem(msg,tipo);
  atualizarOpcaoOffline();
}
function mostrarApp(user,{offline=false}={}){
  modoOffline=offline;
  $('telaLogin')?.classList.add('oculto');
  $('appShell')?.classList.remove('oculto');
  if($('topoUsuario'))$('topoUsuario').textContent=(user?.email||'Acesso local')+(offline?' • offline':'');
  if($('topoUsuario'))$('topoUsuario').classList.toggle('offline-badge',offline);
  renderTudo();
  atualizarPainelAuth();
}
function atualizarOpcaoOffline(){
  const salvo=authOfflineSalva();
  const btn=$('btnEntrarOffline'),info=$('loginOfflineInfo');
  if(!btn)return;
  const pode=!!salvo?.liberado;
  btn.classList.toggle('oculto',!pode||navigator.onLine);
  info?.classList.toggle('oculto',pode||navigator.onLine);
  if(pode&& !navigator.onLine) btn.textContent=`📴 Continuar offline como ${salvo.email}`;
}
function setNuvemStatus(texto,tipo='local'){
  const el=$('nuvemStatus');if(!el)return;
  el.textContent=texto;el.className=`nuvem-status status-${tipo}`;
}
function setNuvemMensagem(texto,erro=false){
  const el=$('nuvemMensagem');if(!el)return;
  el.textContent=texto;el.classList.toggle('erro',erro);
}
function atualizarPainelAuth(){
  const configurada=configSupabaseValida();
  if($('nuvemNaoConfigurada'))$('nuvemNaoConfigurada').classList.toggle('oculto',configurada);
  if($('authDeslogado'))$('authDeslogado').classList.add('oculto');
  if($('authLogado'))$('authLogado').classList.toggle('oculto',!configurada||(!usuarioNuvem&&!modoOffline));
  if($('authUsuario'))$('authUsuario').textContent=usuarioNuvem?.email||authOfflineSalva()?.email||'—';
  if(!configurada)setNuvemStatus('Configuração pendente','local');
  else if(modoOffline||!navigator.onLine)setNuvemStatus('Offline — usando cache','offline');
  else if(usuarioNuvem&&nuvemAtiva)setNuvemStatus('Sincronização ativa','online');
  else if(usuarioNuvem)setNuvemStatus('Conectado','atencao');
  else setNuvemStatus('Desconectado','local');
}
async function contarDadosNuvem(){
  if(!supabaseClient||!usuarioNuvem||modoOffline)return 0;
  const {count,error}=await supabaseClient.from('mc_clientes').select('*',{count:'exact',head:true});
  if(error)throw error;return count||0;
}
async function carregarNuvem({forcar=false}={}){
  if(!supabaseClient||!usuarioNuvem||modoOffline)return false;
  if(!navigator.onLine){setNuvemMensagem('Sem internet. Mantendo a cópia salva neste aparelho.');return false;}
  setNuvemStatus('Baixando dados…','sync');
  try{
    const [c,p,pg]=await Promise.all([
      supabaseClient.from('mc_clientes').select('*').order('nome'),
      supabaseClient.from('mc_projetos').select('*').order('id'),
      supabaseClient.from('mc_pagamentos').select('*').order('id')
    ]);
    if(c.error)throw c.error;if(p.error)throw p.error;if(pg.error)throw pg.error;
    const remoto={
      clientes:(c.data||[]).map(x=>({id:Number(x.id),nome:x.nome||'',telefone:x.telefone||'',documento:x.documento||'',cidade:x.cidade||'',obs:x.obs||''})),
      projetos:(p.data||[]).map(x=>({id:Number(x.id),clienteId:Number(x.cliente_id),tipo:x.tipo,nome:x.nome||'',data:x.data||hoje(),valor:Number(x.valor)||0,valorFinanciado:Number(x.valor_financiado)||0,percentual:Number(x.percentual)||0,area:Number(x.area)||0,valorHa:Number(x.valor_ha)||0,status:x.status||'em_andamento',obs:x.obs||''})),
      pagamentos:(pg.data||[]).map(x=>({id:Number(x.id),projetoId:Number(x.projeto_id),valor:Number(x.valor)||0,data:x.data||hoje(),forma:x.forma||'',obs:x.obs||''}))
    };
    const temRemoto=remoto.clientes.length||remoto.projetos.length||remoto.pagamentos.length;
    if(!temRemoto&&!forcar){
      nuvemAtiva=false;localStorage.removeItem(CLOUD_ACTIVE_KEY);
      setNuvemMensagem('A nuvem está vazia. Se este aparelho já possui dados, clique em “Enviar dados deste aparelho”.');
      atualizarPainelAuth();return false;
    }
    db=remoto;localStorage.setItem(STORAGE,JSON.stringify(db));
    nuvemAtiva=true;localStorage.setItem(CLOUD_ACTIVE_KEY,'1');renderTudo();
    setNuvemMensagem(`Dados baixados: ${db.clientes.length} cliente(s), ${db.projetos.length} projeto(s).`);
    setNuvemStatus('Sincronização ativa','online');return true;
  }catch(err){
    console.error(err);setNuvemStatus('Erro de conexão','erro');setNuvemMensagem('Não foi possível baixar os dados: '+(err.message||err),true);return false;
  }
}
async function sincronizarNuvem(){
  if(!supabaseClient||!usuarioNuvem||!nuvemAtiva||sincronizando||modoOffline)return false;
  if(!navigator.onLine){setNuvemStatus('Offline — usando cache','offline');setNuvemMensagem('Alterações guardadas neste aparelho. Serão enviadas quando a internet voltar.');return false;}
  sincronizando=true;setNuvemStatus('Sincronizando…','sync');
  try{
    const {error}=await supabaseClient.rpc('mc_sync_state',{payload:db});
    if(error)throw error;
    const agora=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    setNuvemStatus('Sincronizado','online');setNuvemMensagem(`Última sincronização: ${agora}.`);return true;
  }catch(err){
    console.error(err);setNuvemStatus('Falha ao sincronizar','erro');setNuvemMensagem('Erro ao enviar para a nuvem: '+(err.message||err),true);return false;
  }finally{sincronizando=false;}
}
function agendarSyncNuvem(){clearTimeout(syncTimer);syncTimer=setTimeout(()=>sincronizarNuvem(),700)}
async function enviarDadosLocais(){
  if(!usuarioNuvem||modoOffline)return alert('Conecte-se à internet e entre na sua conta primeiro.');
  const totalLocal=db.clientes.length+db.projetos.length+db.pagamentos.length;
  if(!confirm(`Enviar os dados deste aparelho para a nuvem?\n\nIsso substituirá os dados atualmente salvos na nuvem.\nRegistros locais: ${totalLocal}.`))return;
  nuvemAtiva=true;localStorage.setItem(CLOUD_ACTIVE_KEY,'1');const ok=await sincronizarNuvem();if(ok)atualizarPainelAuth();
}
async function baixarDadosNuvem(){
  if(!usuarioNuvem||modoOffline)return alert('Conecte-se à internet e entre na sua conta primeiro.');
  if((db.clientes.length||db.projetos.length||db.pagamentos.length)&&!confirm('Baixar os dados da nuvem? A cópia local deste aparelho será substituída.'))return;
  await carregarNuvem({forcar:true});atualizarPainelAuth();
}
async function aposLogin(user){
  usuarioNuvem=user;modoOffline=false;salvarAutorizacaoOffline(user);mostrarApp(user);
  try{
    const n=await contarDadosNuvem();
    if(n>0)await carregarNuvem({forcar:true});
    else setNuvemMensagem('Conta conectada. A nuvem está vazia; você pode enviar os dados deste aparelho.');
  }catch(e){setNuvemMensagem('Login feito, mas o banco ainda não respondeu. Confira se database.sql foi executado.',true)}
}
async function initSupabase(){
  if(inicializandoSupabase)return;inicializandoSupabase=true;
  try{
    atualizarOpcaoOffline();
    if(!configSupabaseValida()){
      $('loginConfigPendente')?.classList.remove('oculto');
      mostrarTelaLogin('Configure o Supabase para usar o login.','info');return;
    }
    $('loginConfigPendente')?.classList.add('oculto');
    if(!navigator.onLine){
      const salvo=authOfflineSalva();
      mostrarTelaLogin(salvo?'Sem internet. Você pode continuar offline neste aparelho.':'Sem internet. Faça o primeiro login com internet para liberar o acesso offline.','info');return;
    }
    if(!window.supabase?.createClient){mostrarTelaLogin('Não foi possível carregar o serviço de login. Verifique sua internet.','erro');return;}
    const cfg=window.MC_SUPABASE_CONFIG;
    supabaseClient=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    const {data:{session},error}=await supabaseClient.auth.getSession();
    if(error)console.warn(error);
    if(session?.user){await aposLogin(session.user)}else mostrarTelaLogin();
    supabaseClient.auth.onAuthStateChange(async(event,sessionNova)=>{
      if(event==='PASSWORD_RECOVERY'){mostrarTelaLogin();mostrarBlocoLogin('nova');return;}
      if(sessionNova?.user){usuarioNuvem=sessionNova.user;salvarAutorizacaoOffline(sessionNova.user);if($('appShell')?.classList.contains('oculto'))mostrarApp(sessionNova.user)}
      else if(event==='SIGNED_OUT'){usuarioNuvem=null;modoOffline=false;mostrarTelaLogin('Você saiu da conta.');}
    });
  }finally{inicializandoSupabase=false;}
}

$('formLogin')?.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!navigator.onLine)return setLoginMensagem('Sem internet. Use “Continuar offline” se este aparelho já foi liberado.','info');
  if(!supabaseClient)return setLoginMensagem('Serviço de login ainda não está disponível.','erro');
  const email=$('loginEmail').value.trim(),password=$('loginSenha').value;
  setLoginMensagem('Entrando…','info');
  const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});
  if(error)return setLoginMensagem('E-mail ou senha incorretos. '+(error.message||''),'erro');
  await aposLogin(data.user);
});
$('btnMostrarCadastro')?.addEventListener('click',()=>{mostrarBlocoLogin('cadastro');setCadastroMensagem()});
$('btnVoltarLogin')?.addEventListener('click',()=>mostrarBlocoLogin('login'));
$('btnEsqueciSenha')?.addEventListener('click',()=>{mostrarBlocoLogin('recuperar');setRecuperarMensagem()});
$('btnVoltarLoginRecuperar')?.addEventListener('click',()=>mostrarBlocoLogin('login'));
$('formCadastroConta')?.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!supabaseClient)return setCadastroMensagem('Conecte-se à internet para criar a conta.','erro');
  const email=$('cadastroEmail').value.trim(),senha=$('cadastroSenha').value,senha2=$('cadastroSenha2').value;
  if(senha!==senha2)return setCadastroMensagem('As senhas não são iguais.','erro');
  if(senha.length<6)return setCadastroMensagem('Use uma senha com pelo menos 6 caracteres.','erro');
  setCadastroMensagem('Criando conta…','info');
  const {data,error}=await supabaseClient.auth.signUp({email,password:senha});
  if(error)return setCadastroMensagem(error.message||'Não foi possível criar a conta.','erro');
  if(data.session&&data.user){setCadastroMensagem('Conta criada! Entrando…','sucesso');await aposLogin(data.user)}
  else setCadastroMensagem('Conta criada. Confira seu e-mail para confirmar o cadastro e depois faça login.','sucesso');
});
$('formRecuperarSenha')?.addEventListener('submit',async e=>{
  e.preventDefault();if(!supabaseClient)return setRecuperarMensagem('Conecte-se à internet.','erro');
  const email=$('recuperarEmail').value.trim();
  const redirectTo=location.origin+location.pathname;
  const {error}=await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo});
  if(error)return setRecuperarMensagem(error.message||'Não foi possível enviar o e-mail.','erro');
  setRecuperarMensagem('Link enviado. Confira seu e-mail.','sucesso');
});
$('formNovaSenha')?.addEventListener('submit',async e=>{
  e.preventDefault();if(!supabaseClient)return setNovaSenhaMensagem('Conecte-se à internet.','erro');
  const s1=$('novaSenhaInput').value,s2=$('novaSenhaInput2').value;
  if(s1!==s2)return setNovaSenhaMensagem('As senhas não são iguais.','erro');
  const {error}=await supabaseClient.auth.updateUser({password:s1});
  if(error)return setNovaSenhaMensagem(error.message||'Não foi possível alterar a senha.','erro');
  setNovaSenhaMensagem('Senha alterada com sucesso.','sucesso');setTimeout(()=>mostrarBlocoLogin('login'),900);
});
document.querySelectorAll('[data-alvo-senha]').forEach(btn=>btn.addEventListener('click',()=>{const el=$(btn.dataset.alvoSenha);if(!el)return;el.type=el.type==='password'?'text':'password';btn.textContent=el.type==='password'?'👁':'🙈'}));
$('btnEntrarOffline')?.addEventListener('click',()=>{
  const salvo=authOfflineSalva();if(!salvo)return;
  usuarioNuvem={email:salvo.email,offline:true};modoOffline=true;mostrarApp(usuarioNuvem,{offline:true});
  setNuvemMensagem('Modo offline ativo. Tudo fica salvo neste aparelho. Quando a internet voltar, entre novamente para sincronizar.');
});
async function sairConta(){
  if(supabaseClient&&navigator.onLine){try{await supabaseClient.auth.signOut()}catch(e){console.warn(e)}}
  usuarioNuvem=null;modoOffline=false;nuvemAtiva=false;localStorage.removeItem(CLOUD_ACTIVE_KEY);limparAutorizacaoOffline();mostrarTelaLogin('Sessão encerrada.');
}
$('btnSairTopo')?.addEventListener('click',()=>{if(confirm('Sair da conta neste aparelho?'))sairConta()});
$('btnSair')?.addEventListener('click',()=>{if(confirm('Sair da conta neste aparelho?'))sairConta()});
$('btnEnviarNuvem')?.addEventListener('click',enviarDadosLocais);
$('btnBaixarNuvem')?.addEventListener('click',baixarDadosNuvem);

window.addEventListener('offline',()=>{
  atualizarOpcaoOffline();
  if(!$('appShell')?.classList.contains('oculto')){modoOffline=true;setNuvemStatus('Offline — usando cache','offline');setNuvemMensagem('Sem internet. As alterações continuam salvas neste aparelho.');}
});
window.addEventListener('online',async()=>{
  atualizarOpcaoOffline();
  if(modoOffline){
    modoOffline=false;
    // A sessão persistida será reaproveitada, se ainda for válida.
    await initSupabase();
  }else if(usuarioNuvem&&nuvemAtiva)sincronizarNuvem();
});

alternarCampos();renderTudo();initSupabase();
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js');
