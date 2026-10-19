import { REPO, ARQUIVO_ACERVO } from "./config.js";

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clonar = (o) => JSON.parse(JSON.stringify(o));

const LIMITE_RELOGIOS = 30;
const MAX_FOTOS = 4;
const LADO_MAX = 1600; // px do lado maior das fotos enviadas
const CHAVE = "magno-painel-token";
const STATUS = { venda: "À venda", chegando: "Chegando", colecao: "Coleção", vendido: "Vendido" };

let token = "";
let original = null; // como está publicado
let dados = null; // como está no painel
const novas = new Map(); // "nova:<id>" -> { blob, url, ext }

/* ---------- GitHub ---------- */

class ErroGitHub extends Error {
  constructor(status, msg) {
    super(msg);
    this.status = status;
  }
}

async function gh(caminho, opcoes = {}) {
  const resp = await fetch(`https://api.github.com/repos/${REPO.owner}/${REPO.repo}${caminho}`, {
    ...opcoes,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(opcoes.body ? { "Content-Type": "application/json" } : {}),
    },
    cache: "no-store",
  });
  if (!resp.ok) {
    let msg = resp.statusText;
    try {
      msg = (await resp.json()).message || msg;
    } catch {}
    throw new ErroGitHub(resp.status, msg);
  }
  return resp.status === 204 ? null : resp.json();
}

function base64ParaTexto(b64) {
  const bin = atob(b64.replace(/\n/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

const blobParaBase64 = (blob) =>
  new Promise((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1]);
    r.onerror = falha;
    r.readAsDataURL(blob);
  });

async function carregarAcervo() {
  const arq = await gh(`/contents/${ARQUIVO_ACERVO}?ref=${encodeURIComponent(REPO.branch)}`);
  const json = JSON.parse(base64ParaTexto(arq.content));
  json.config ||= {};
  json.relogios ||= [];
  json.curiosidades ||= [];
  return json;
}

function referencias(d) {
  return new Set([...d.relogios.flatMap((r) => r.fotos || []), ...d.curiosidades.map((c) => c.foto).filter(Boolean)]);
}

async function publicar() {
  const botao = $("[data-publicar]");
  botao.disabled = true;
  botao.textContent = "Publicando…";
  try {
    const ref = await gh(`/git/ref/heads/${encodeURIComponent(REPO.branch)}`);
    const commitAtual = await gh(`/git/commits/${ref.object.sha}`);
    const final = clonar(dados);
    const arvore = [];

    // fotos novas: viram arquivos em fotos/<id do relógio>/
    const renomear = new Map();
    const carimbo = Date.now().toString(36);
    const fotosNovas = [];
    final.relogios.forEach((r) =>
      (r.fotos || []).forEach((f, i) => f.startsWith("nova:") && fotosNovas.push([f, `fotos/${r.id}/${carimbo}-${i + 1}`]))
    );
    final.curiosidades.forEach((c) => c.foto?.startsWith("nova:") && fotosNovas.push([c.foto, `fotos/curiosidades/${c.id}-${carimbo}`]));

    let n = 0;
    for (const [chave, base] of fotosNovas) {
      const foto = novas.get(chave);
      if (!foto) continue;
      botao.textContent = `Enviando fotos ${++n}/${fotosNovas.length}…`;
      const blob = await gh("/git/blobs", {
        method: "POST",
        body: JSON.stringify({ content: await blobParaBase64(foto.blob), encoding: "base64" }),
      });
      const caminho = `${base}.${foto.ext}`;
      renomear.set(chave, caminho);
      arvore.push({ path: caminho, mode: "100644", type: "blob", sha: blob.sha });
    }
    final.relogios.forEach((r) => (r.fotos = (r.fotos || []).map((f) => renomear.get(f) || f)));
    final.curiosidades.forEach((c) => c.foto && (c.foto = renomear.get(c.foto) || c.foto));

    // fotos que deixaram de ser usadas saem do repositório
    const usadas = referencias(final);
    for (const f of referencias(original)) {
      if (!usadas.has(f) && f.startsWith("fotos/")) arvore.push({ path: f, mode: "100644", type: "blob", sha: null });
    }

    botao.textContent = "Salvando…";
    arvore.push({ path: ARQUIVO_ACERVO, mode: "100644", type: "blob", content: JSON.stringify(final, null, 2) + "\n" });

    const novaArvore = await gh("/git/trees", {
      method: "POST",
      body: JSON.stringify({ base_tree: commitAtual.tree.sha, tree: arvore }),
    });
    const commit = await gh("/git/commits", {
      method: "POST",
      body: JSON.stringify({ message: mensagemCommit(), tree: novaArvore.sha, parents: [ref.object.sha] }),
    });
    await gh(`/git/refs/heads/${encodeURIComponent(REPO.branch)}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha }),
    });

    for (const f of novas.values()) URL.revokeObjectURL(f.url);
    novas.clear();
    dados = final;
    original = clonar(final);
    renderizarTudo();
    avisar("Publicado. O site atualiza em cerca de um minuto.");
  } catch (e) {
    console.error(e);
    if (e.status === 401) return sair("Sua chave de acesso expirou ou foi revogada. Entre com uma nova chave.");
    if (e.status === 409 || e.status === 422)
      avisar("O repositório mudou enquanto você publicava. Toque em Publicar de novo.", true);
    else if (e.status === 403 || e.status === 404)
      avisar("A chave não tem permissão de escrita neste repositório. Confira a permissão Contents: Read and write.", true);
    else avisar(`Não foi possível publicar: ${e.message}. Verifique a internet e tente de novo.`, true);
  } finally {
    botao.disabled = false;
    botao.textContent = "Publicar no site";
  }
}

function mensagemCommit() {
  const a = new Map(original.relogios.map((r) => [r.id, r]));
  const b = new Map(dados.relogios.map((r) => [r.id, r]));
  const partes = [];
  const add = [...b.keys()].filter((k) => !a.has(k)).map((k) => `${b.get(k).marca} ${b.get(k).modelo}`);
  const rem = [...a.keys()].filter((k) => !b.has(k)).map((k) => `${a.get(k).marca} ${a.get(k).modelo}`);
  if (add.length) partes.push(`adiciona ${add.join(", ")}`);
  if (rem.length) partes.push(`remove ${rem.join(", ")}`);
  return partes.length ? `Vitrine: ${partes.join("; ")}` : "Vitrine: atualiza o acervo";
}

/* ---------- fotos ---------- */

async function prepararFoto(arquivo) {
  const bitmap = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
  const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const gerar = (tipo) => new Promise((ok) => canvas.toBlob(ok, tipo, 0.85));
  let blob = await gerar("image/webp");
  if (!blob || blob.type !== "image/webp") blob = await gerar("image/jpeg");
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const chave = `nova:${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
  novas.set(chave, { blob, ext, url: URL.createObjectURL(blob) });
  return chave;
}

const srcFoto = (ref) => (ref?.startsWith("nova:") ? novas.get(ref)?.url : ref);

/** Lista de fotos editável: reordenar, remover, adicionar. */
function editorFotos(alvo, lista, max, erroEl) {
  const desenhar = () => {
    alvo.innerHTML =
      lista
        .map(
          (f, i) => `
        <figure class="foto">
          <img src="${esc(srcFoto(f))}" alt="Foto ${i + 1}">
          ${i === 0 && max > 1 ? `<figcaption>Capa</figcaption>` : ""}
          <div class="foto-acoes">
            ${max > 1 ? `<button type="button" data-mover="${i}" data-dir="-1" aria-label="Mover foto ${i + 1} para a esquerda" ${i === 0 ? "disabled" : ""}>‹</button>
            <button type="button" data-mover="${i}" data-dir="1" aria-label="Mover foto ${i + 1} para a direita" ${i === lista.length - 1 ? "disabled" : ""}>›</button>` : ""}
            <button type="button" data-tirar="${i}" aria-label="Remover foto ${i + 1}">×</button>
          </div>
        </figure>`
        )
        .join("") +
      (lista.length < max
        ? `<label class="foto foto-nova">
            <input type="file" accept="image/*" ${max > 1 ? "multiple" : ""} hidden>
            <span>+</span><small>${lista.length ? "Adicionar" : max > 1 ? "Adicionar fotos" : "Adicionar foto"}</small>
          </label>`
        : "");
  };
  alvo.onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.tirar) lista.splice(Number(b.dataset.tirar), 1);
    if (b.dataset.mover) {
      const i = Number(b.dataset.mover);
      const j = i + Number(b.dataset.dir);
      [lista[i], lista[j]] = [lista[j], lista[i]];
    }
    desenhar();
  };
  alvo.onchange = async (e) => {
    const arquivos = [...(e.target.files || [])];
    if (!arquivos.length) return;
    const cabem = arquivos.slice(0, max - lista.length);
    if (erroEl) erroEl.textContent = arquivos.length > cabem.length ? `Só cabem ${max} fotos. As ${arquivos.length - cabem.length} últimas ficaram de fora.` : "";
    alvo.classList.add("carregando");
    for (const a of cabem) {
      try {
        lista.push(await prepararFoto(a));
      } catch {
        if (erroEl) erroEl.textContent = `Não consegui abrir “${a.name}”. Use uma foto JPG, PNG ou WebP.`;
      }
    }
    alvo.classList.remove("carregando");
    desenhar();
  };
  desenhar();
}

/* ---------- interface ---------- */

function avisar(texto, erro = false) {
  const el = $("[data-aviso]");
  el.textContent = texto;
  el.classList.toggle("aviso-erro", erro);
  el.classList.add("visivel");
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => el.classList.remove("visivel"), erro ? 7000 : 3500);
}

const temMudancas = () => JSON.stringify(dados) !== JSON.stringify(original);

function atualizarBarra() {
  const barra = $("[data-barra-publicar]");
  barra.hidden = !temMudancas();
  document.body.classList.toggle("com-barra", !barra.hidden);
  $("[data-pendentes]").textContent = "Alterações não publicadas. ";
}

const brl = (v) =>
  typeof v === "number" ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : "";

function renderizarRelogios() {
  const lista = dados.relogios;
  $("[data-contagem]").textContent = `${lista.length} de ${LIMITE_RELOGIOS} relógios. A ordem aqui é a ordem no site.`;
  $("[data-novo-relogio]").disabled = lista.length >= LIMITE_RELOGIOS;
  $("[data-lista-relogios]").innerHTML = lista.length
    ? lista
        .map(
          (r, i) => `
      <article class="item" data-id="${esc(r.id)}">
        <div class="item-foto">${r.fotos?.[0] ? `<img src="${esc(srcFoto(r.fotos[0]))}" alt="">` : ""}</div>
        <div class="item-info">
          <p class="item-marca">${esc(r.marca)}</p>
          <h2>${esc(r.modelo)}</h2>
          <p class="item-meta">${[brl(r.preco), `${(r.fotos || []).length} foto${(r.fotos || []).length === 1 ? "" : "s"}`].filter(Boolean).join(", ")}</p>
        </div>
        <label class="item-status">
          <span class="sr">Situação de ${esc(r.marca)} ${esc(r.modelo)}</span>
          <select data-status>
            ${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${r.status === k ? "selected" : ""}>${v}</option>`).join("")}
          </select>
        </label>
        <div class="item-acoes">
          <button type="button" class="icone" data-subir aria-label="Subir" ${i === 0 ? "disabled" : ""}>↑</button>
          <button type="button" class="icone" data-descer aria-label="Descer" ${i === lista.length - 1 ? "disabled" : ""}>↓</button>
          <button type="button" class="botao botao-linha" data-editar>Editar</button>
          <button type="button" class="botao botao-linha botao-perigo" data-remover>Remover</button>
        </div>
      </article>`
        )
        .join("")
    : `<p class="vazio">Nenhum relógio ainda. Toque em “Adicionar relógio” para começar.</p>`;
}

function renderizarCuriosidades() {
  $("[data-lista-curiosidades]").innerHTML = dados.curiosidades.length
    ? dados.curiosidades
        .map(
          (c, i) => `
      <article class="item item-texto" data-id="${esc(c.id)}">
        <div class="item-info">
          <h2>${esc(c.titulo)}</h2>
          <p class="item-meta">${esc(c.texto.slice(0, 110))}${c.texto.length > 110 ? "…" : ""}</p>
        </div>
        <div class="item-acoes">
          <button type="button" class="icone" data-subir aria-label="Subir" ${i === 0 ? "disabled" : ""}>↑</button>
          <button type="button" class="icone" data-descer aria-label="Descer" ${i === dados.curiosidades.length - 1 ? "disabled" : ""}>↓</button>
          <button type="button" class="botao botao-linha" data-editar>Editar</button>
          <button type="button" class="botao botao-linha botao-perigo" data-remover>Remover</button>
        </div>
      </article>`
        )
        .join("")
    : `<p class="vazio">Nenhuma curiosidade ainda.</p>`;
}

function renderizarContato() {
  const f = $("[data-form-contato]");
  for (const k of ["whatsapp", "instagram", "cidade", "sobre"]) f.elements[k].value = dados.config[k] || "";
}

function renderizarTudo() {
  renderizarRelogios();
  renderizarCuriosidades();
  renderizarContato();
  atualizarBarra();
}

function slug(texto) {
  const base = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "item";
  const usados = new Set([...dados.relogios, ...dados.curiosidades].map((x) => x.id));
  let id = base;
  for (let n = 2; usados.has(id); n++) id = `${base}-${n}`;
  return id;
}

/* ---------- editor de relógio ---------- */

let emEdicao = null; // { id | null, fotos: [] }

function abrirRelogio(id) {
  const dlg = $("[data-editor-relogio]");
  const form = $("[data-form-relogio]");
  const r = id ? dados.relogios.find((x) => x.id === id) : null;
  form.reset();
  emEdicao = { id, fotos: [...(r?.fotos || [])] };
  $("#ed-titulo").textContent = r ? `${r.marca} ${r.modelo}` : "Novo relógio";
  if (r) {
    for (const k of ["marca", "modelo", "referencia", "ano", "previsao", "caixa", "material", "movimento", "pulseira", "kit", "condicao", "descricao"])
      form.elements[k].value = r[k] || "";
    form.elements.preco.value = typeof r.preco === "number" ? r.preco.toLocaleString("pt-BR") : "";
    form.elements.status.value = r.status;
  }
  $("[data-erro-fotos]").textContent = "";
  editorFotos($("[data-fotos]"), emEdicao.fotos, MAX_FOTOS, $("[data-erro-fotos]"));
  mostrarCampos();
  dlg.showModal();
  if (!r) setTimeout(() => form.elements.marca.focus(), 50);
}

function mostrarCampos() {
  const status = $("[data-form-relogio]").elements.status.value;
  $$("[data-so]", $("[data-form-relogio]")).forEach((el) => (el.hidden = !el.dataset.so.split(" ").includes(status)));
}

function guardarRelogio(e) {
  e.preventDefault();
  const form = e.target;
  const v = (k) => form.elements[k].value.trim();
  if (!emEdicao.fotos.length) {
    $("[data-erro-fotos]").textContent = "Adicione pelo menos uma foto.";
    $("[data-fotos]").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const precoTxt = v("preco").replace(/[^\d,]/g, "").replace(",", ".");
  const relogio = {
    id: emEdicao.id || slug(`${v("marca")} ${v("modelo")}`),
    status: form.elements.status.value,
    marca: v("marca"),
    modelo: v("modelo"),
    referencia: v("referencia"),
    ano: v("ano"),
    preco: precoTxt ? Math.round(Number(precoTxt)) : null,
    previsao: v("previsao"),
    caixa: v("caixa"),
    material: v("material"),
    movimento: v("movimento"),
    pulseira: v("pulseira"),
    kit: v("kit"),
    condicao: v("condicao"),
    descricao: v("descricao"),
    fotos: [...emEdicao.fotos],
  };
  if (emEdicao.id) {
    const i = dados.relogios.findIndex((x) => x.id === emEdicao.id);
    dados.relogios[i] = relogio;
  } else {
    dados.relogios.unshift(relogio);
  }
  $("[data-editor-relogio]").close();
  renderizarRelogios();
  atualizarBarra();
  avisar(`${relogio.marca} ${relogio.modelo} guardado. Publique para aparecer no site.`);
}

/* ---------- editor de curiosidade ---------- */

let curEdicao = null;

function abrirCuriosidade(id) {
  const dlg = $("[data-editor-curiosidade]");
  const form = $("[data-form-curiosidade]");
  const c = id ? dados.curiosidades.find((x) => x.id === id) : null;
  form.reset();
  form.elements.relogio.innerHTML =
    `<option value="">Nenhum</option>` +
    dados.relogios.map((r) => `<option value="${esc(r.id)}">${esc(r.marca)} ${esc(r.modelo)}</option>`).join("");
  curEdicao = { id, fotos: c?.foto ? [c.foto] : [] };
  $("#ec-titulo").textContent = c ? "Editar curiosidade" : "Nova curiosidade";
  if (c) {
    form.elements.titulo.value = c.titulo;
    form.elements.texto.value = c.texto;
    form.elements.relogio.value = c.relogio || "";
  }
  editorFotos($("[data-foto-curiosidade]"), curEdicao.fotos, 1);
  dlg.showModal();
}

function guardarCuriosidade(e) {
  e.preventDefault();
  const f = e.target.elements;
  const item = {
    id: curEdicao.id || slug(f.titulo.value.trim()),
    titulo: f.titulo.value.trim(),
    texto: f.texto.value.trim(),
    relogio: f.relogio.value,
    ...(curEdicao.fotos[0] ? { foto: curEdicao.fotos[0] } : {}),
  };
  if (curEdicao.id) dados.curiosidades[dados.curiosidades.findIndex((x) => x.id === curEdicao.id)] = item;
  else dados.curiosidades.unshift(item);
  $("[data-editor-curiosidade]").close();
  renderizarCuriosidades();
  atualizarBarra();
}

/* ---------- ações de lista ---------- */

function ligarLista(seletor, colecao, abrir, renderizar) {
  $(seletor).addEventListener("click", (e) => {
    const item = e.target.closest(".item");
    if (!item) return;
    const lista = dados[colecao];
    const i = lista.findIndex((x) => x.id === item.dataset.id);
    if (e.target.closest("[data-editar]")) return abrir(item.dataset.id);
    if (e.target.closest("[data-remover]")) {
      const x = lista[i];
      const nome = x.titulo || `${x.marca} ${x.modelo}`;
      if (!confirm(`Remover “${nome}”? Ele sai do site quando você publicar.`)) return;
      lista.splice(i, 1);
    } else if (e.target.closest("[data-subir]") && i > 0) {
      [lista[i - 1], lista[i]] = [lista[i], lista[i - 1]];
    } else if (e.target.closest("[data-descer]") && i < lista.length - 1) {
      [lista[i + 1], lista[i]] = [lista[i], lista[i + 1]];
    } else return;
    renderizar();
    atualizarBarra();
  });
}

/* ---------- entrar e sair ---------- */

function mostrar(tela) {
  $$("[data-tela]").forEach((el) => (el.hidden = el.dataset.tela !== tela));
}

async function entrar(t, lembrar) {
  token = t;
  const erro = $("[data-erro-entrada]");
  erro.textContent = "";
  try {
    const acervo = await carregarAcervo();
    (lembrar ? localStorage : sessionStorage).setItem(CHAVE, t);
    original = acervo;
    dados = clonar(acervo);
    mostrar("app");
    renderizarTudo();
  } catch (e) {
    token = "";
    localStorage.removeItem(CHAVE);
    sessionStorage.removeItem(CHAVE);
    mostrar("entrada");
    if (e.status === 401) erro.textContent = "Chave inválida ou expirada. Gere uma nova chave e tente de novo.";
    else if (e.status === 404 || e.status === 403)
      erro.textContent = `A chave não dá acesso ao repositório ${REPO.owner}/${REPO.repo}. Confira se ele foi selecionado ao criar a chave.`;
    else erro.textContent = "Não foi possível conectar ao GitHub. Verifique a internet e tente de novo.";
  }
}

function sair(motivo) {
  if (!motivo && temMudancas() && !confirm("Há alterações não publicadas. Sair mesmo assim?")) return;
  token = "";
  localStorage.removeItem(CHAVE);
  sessionStorage.removeItem(CHAVE);
  original = dados = null;
  mostrar("entrada");
  $("[data-erro-entrada]").textContent = motivo || "";
}

/* ---------- início ---------- */

function iniciar() {
  $("[data-nome-repo]").textContent = REPO.repo;

  $("[data-form-entrada]").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target.elements;
    entrar(f.token.value.trim(), f.lembrar.checked);
  });
  $("[data-sair]").addEventListener("click", () => sair());

  $$("[data-aba]").forEach((b) =>
    b.addEventListener("click", () => {
      $$("[data-aba]").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
      $$("[data-painel]").forEach((p) => (p.hidden = p.dataset.painel !== b.dataset.aba));
    })
  );

  $("[data-novo-relogio]").addEventListener("click", () => abrirRelogio(null));
  $("[data-nova-curiosidade]").addEventListener("click", () => abrirCuriosidade(null));
  $("[data-form-relogio]").addEventListener("submit", guardarRelogio);
  $("[data-form-relogio]").addEventListener("change", (e) => e.target.name === "status" && mostrarCampos());
  $("[data-form-curiosidade]").addEventListener("submit", guardarCuriosidade);
  $$("[data-cancelar]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));

  ligarLista("[data-lista-relogios]", "relogios", abrirRelogio, renderizarRelogios);
  ligarLista("[data-lista-curiosidades]", "curiosidades", abrirCuriosidade, renderizarCuriosidades);

  $("[data-lista-relogios]").addEventListener("change", (e) => {
    if (!e.target.matches("[data-status]")) return;
    const id = e.target.closest(".item").dataset.id;
    dados.relogios.find((r) => r.id === id).status = e.target.value;
    atualizarBarra();
  });

  $("[data-form-contato]").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target.elements;
    for (const k of ["whatsapp", "instagram", "cidade", "sobre"]) dados.config[k] = f[k].value.trim();
    atualizarBarra();
    avisar(temMudancas() ? "Guardado. Publique para aparecer no site." : "Nada mudou.");
  });

  $("[data-publicar]").addEventListener("click", publicar);
  $("[data-descartar]").addEventListener("click", () => {
    if (!confirm("Descartar todas as alterações não publicadas?")) return;
    dados = clonar(original);
    novas.clear();
    renderizarTudo();
  });

  addEventListener("beforeunload", (e) => {
    if (dados && temMudancas()) e.preventDefault();
  });

  const salvo = localStorage.getItem(CHAVE) || sessionStorage.getItem(CHAVE);
  if (salvo) entrar(salvo, !!localStorage.getItem(CHAVE));
  else mostrar("entrada");
}

iniciar();
