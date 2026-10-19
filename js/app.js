import { ARQUIVO_ACERVO } from "./config.js";

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const reduzMovimento = matchMedia("(prefers-reduced-motion: reduce)").matches;

const STATUS = {
  venda: "À venda",
  chegando: "Chegando",
  colecao: "Coleção",
  vendido: "Vendido",
};

let acervo = { config: {}, relogios: [], curiosidades: [] };
let abriuPorClique = false;

/* ---------- utilidades ---------- */

const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const brl = (v) =>
  typeof v === "number"
    ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
    : "";

function previsao(ym, curto = false) {
  if (!ym) return "";
  const [a, m] = ym.split("-").map(Number);
  if (!a || !m) return ym;
  return new Date(a, m - 1, 1).toLocaleDateString("pt-BR", { month: curto ? "short" : "long", year: "numeric" });
}

// envolve números em <span class="num"> para títulos em Marcellus
const comNum = (s = "") => esc(s).replace(/\d[\d.,]*/g, (n) => `<span class="num">${n}</span>`);

const nomeCompleto = (r) => `${r.marca} ${r.modelo}`.trim();
const linkRelogio = (r) => `${location.origin}${location.pathname}#relogio/${r.id}`;

function linkWhatsApp(texto) {
  const numero = (acervo.config.whatsapp || "").replace(/\D/g, "");
  const t = encodeURIComponent(texto);
  return numero ? `https://wa.me/${numero}?text=${t}` : `https://wa.me/?text=${t}`;
}

function mensagemPara(r) {
  const ref = r.referencia ? ` (ref. ${r.referencia})` : "";
  const base = {
    venda: `Olá! Vi na vitrine da Magno Watches e tenho interesse no ${nomeCompleto(r)}${ref}${r.preco ? `, anunciado por ${brl(r.preco)}` : ""}. Ainda está disponível?`,
    chegando: `Olá! Vi na vitrine da Magno Watches que o ${nomeCompleto(r)}${ref} está chegando. Gostaria de reservar.`,
    colecao: `Olá! Vi o ${nomeCompleto(r)}${ref} na sua coleção e queria conversar sobre ele.`,
    vendido: `Olá! Vi que o ${nomeCompleto(r)}${ref} já foi vendido. Se aparecer outro parecido, me avisa?`,
  }[r.status];
  return `${base}\n${linkRelogio(r)}`;
}

function avisar(texto) {
  const el = $("[data-aviso]");
  el.textContent = texto;
  el.classList.add("visivel");
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => el.classList.remove("visivel"), 2600);
}

/* ---------- mostrador da abertura ---------- */

function montarMostrador() {
  const alvo = $("#mostrador");
  const marcas = Array.from({ length: 60 }, (_, i) => {
    const hora = i % 5 === 0;
    return `<line x1="200" y1="${hora ? 22 : 26}" x2="200" y2="34" transform="rotate(${i * 6} 200 200)" class="${hora ? "marca-hora" : "marca-min"}"/>`;
  }).join("");
  const setas = [0, 90, 180, 270]
    .map((a) => `<path d="M200 82 L193 64 L207 64 Z" transform="rotate(${a} 200 200)"/>`)
    .join("");

  alvo.innerHTML = `
  <svg viewBox="0 0 400 400" aria-hidden="true">
    <defs>
      <linearGradient id="prata" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f6f4ee"/><stop offset=".42" stop-color="#9fa1a5"/>
        <stop offset=".6" stop-color="#ecebe5"/><stop offset="1" stop-color="#85878c"/>
      </linearGradient>
      <radialGradient id="fundo" cx="50%" cy="38%" r="65%">
        <stop offset="0" stop-color="#17181a"/><stop offset="1" stop-color="#000"/>
      </radialGradient>
    </defs>
    <circle cx="200" cy="200" r="198" fill="url(#fundo)"/>
    <circle cx="200" cy="200" r="194" fill="none" stroke="url(#prata)" stroke-width="3"/>
    <g>${marcas}</g>
    <circle cx="200" cy="200" r="126" fill="none" stroke="url(#prata)" stroke-width="2.5"/>
    <circle cx="200" cy="200" r="119" fill="none" stroke="url(#prata)" stroke-width="1"/>
    <g fill="url(#prata)">${setas}</g>
    <text x="200" y="243" text-anchor="middle" class="mostrador-m" fill="url(#prata)">M</text>
    <g class="ponteiro" data-p="h"><path d="M197.6 214 L198.6 112 L200 104 L201.4 112 L202.4 214 Z"/></g>
    <g class="ponteiro" data-p="m"><path d="M198.4 218 L199.2 54 L200 46 L200.8 54 L201.6 218 Z"/></g>
    <g class="ponteiro ponteiro-s" data-p="s"><line x1="200" y1="236" x2="200" y2="40"/><circle cx="200" cy="200" r="4.5"/></g>
    <circle cx="200" cy="200" r="2" fill="#000"/>
  </svg>`;

  const ph = $('[data-p="h"]', alvo);
  const pm = $('[data-p="m"]', alvo);
  const ps = $('[data-p="s"]', alvo);

  const angulos = (d = new Date()) => {
    const s = d.getSeconds() + d.getMilliseconds() / 1000;
    const m = d.getMinutes() + s / 60;
    const h = (d.getHours() % 12) + m / 60;
    return { h: h * 30, m: m * 6, s: s * 6 };
  };
  const girar = ({ h, m, s }) => {
    ph.setAttribute("transform", `rotate(${h} 200 200)`);
    pm.setAttribute("transform", `rotate(${m} 200 200)`);
    ps.setAttribute("transform", `rotate(${s} 200 200)`);
  };

  if (reduzMovimento) {
    const tick = () => girar(angulos());
    tick();
    setInterval(tick, 1000);
    return;
  }

  // Abre em 10h10, a pose clássica das fotos de relógio, e desliza até a hora certa.
  const inicio = { h: 10 * 30 + 5, m: 60, s: 0 };
  const duracao = 1600;
  const t0 = performance.now();
  let visivel = true;
  new IntersectionObserver(([e]) => {
    visivel = e.isIntersecting;
    if (visivel) requestAnimationFrame(quadro);
  }).observe(alvo);

  function quadro(agora) {
    if (!visivel) return;
    const alvoAng = angulos();
    const p = Math.min((agora - t0) / duracao, 1);
    if (p < 1) {
      const e = 1 - Math.pow(1 - p, 3);
      const caminho = (de, para) => {
        let delta = ((para - de) % 360 + 360) % 360; // sempre no sentido horário
        return de + delta * e;
      };
      girar({ h: caminho(inicio.h, alvoAng.h), m: caminho(inicio.m, alvoAng.m), s: caminho(inicio.s, alvoAng.s) });
    } else {
      girar(alvoAng);
    }
    requestAnimationFrame(quadro);
  }
  girar(inicio);
  requestAnimationFrame(quadro);
}

/* ---------- vitrine ---------- */

function cartao(r) {
  const [f1, f2] = r.fotos || [];
  const ref = [r.referencia && `Ref. ${r.referencia}`, r.ano].filter(Boolean).join(", ");
  let rodape = "";
  if (r.status === "venda") rodape = `<p class="cartao-preco">${brl(r.preco) || "Preço sob consulta"}</p>`;
  if (r.status === "chegando")
    rodape = `<p class="cartao-preco">${brl(r.preco) || "Preço sob consulta"}</p>
              ${r.previsao ? `<p class="cartao-previsao">Chega em ${esc(previsao(r.previsao, true))}</p>` : ""}`;
  return `
  <a class="cartao" href="#relogio/${esc(r.id)}" data-abrir="${esc(r.id)}" data-marca="${esc(r.marca)}">
    <div class="palco">
      ${f1 ? `<img src="${esc(f1)}" alt="${esc(nomeCompleto(r))}" loading="lazy" decoding="async">` : `<span class="sem-foto">Sem foto</span>`}
      ${f2 ? `<img class="palco-alt" src="${esc(f2)}" alt="" loading="lazy" decoding="async">` : ""}
    </div>
    <div class="cartao-info">
      <p class="cartao-marca">${esc(r.marca)}</p>
      <h3 class="cartao-modelo">${comNum(r.modelo)}</h3>
      ${ref ? `<p class="cartao-ref">${esc(ref)}</p>` : ""}
      ${rodape}
      <span class="cartao-ver">Ver detalhes</span>
    </div>
  </a>`;
}

function vazio(status) {
  const texto = {
    venda: "Nenhum relógio à venda no momento. Fale comigo para saber o que vem por aí.",
    chegando: "Nenhum relógio a caminho agora.",
    colecao: "A coleção ainda está sendo fotografada.",
  }[status];
  return `<p class="vazio">${texto}</p>`;
}

function montarFiltro(status, lista) {
  const el = $(`[data-filtro="${status}"]`);
  if (!el) return;
  const marcas = [...new Set(lista.map((r) => r.marca))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  if (lista.length < 4 || marcas.length < 2) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.innerHTML =
    `<span class="filtro-rotulo" id="filtro-${status}">Marca</span>` +
    ["Todas", ...marcas]
      .map((m, i) => `<button type="button" aria-pressed="${i === 0}" data-marca="${esc(m)}" aria-describedby="filtro-${status}">${esc(m)}</button>`)
      .join("");
  el.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    $$("button", el).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    const marca = b.dataset.marca;
    $$(`[data-lista="${status}"] .cartao`).forEach((c) => {
      c.hidden = marca !== "Todas" && c.dataset.marca !== marca;
    });
  });
}

function renderizar() {
  const { config, relogios, curiosidades } = acervo;
  const por = (s) => relogios.filter((r) => r.status === s);

  $("[data-sobre]").textContent = config.sobre || "";
  if (config.nome) document.title = config.nome;

  for (const s of ["venda", "chegando", "colecao"]) {
    const lista = por(s);
    $(`[data-lista="${s}"]`).innerHTML = lista.length ? lista.map(cartao).join("") : vazio(s);
    $(`[data-conta="${s}"]`).textContent = lista.length || "";
    montarFiltro(s, lista);
  }

  const vendidos = por("vendido");
  $("[data-vendidos]").hidden = !vendidos.length;
  $('[data-lista="vendido"]').innerHTML = vendidos
    .map(
      (r) => `<a class="vendido" href="#relogio/${esc(r.id)}">
        ${r.fotos?.[0] ? `<img src="${esc(r.fotos[0])}" alt="" loading="lazy">` : ""}
        <span>${esc(nomeCompleto(r))}</span></a>`
    )
    .join("");

  const resumo = [
    ["venda", por("venda").length, (n) => (n === 1 ? "1 à venda" : `${n} à venda`)],
    ["chegando", por("chegando").length, (n) => (n === 1 ? "1 chegando" : `${n} chegando`)],
    ["colecao", por("colecao").length, (n) => (n === 1 ? "1 na coleção" : `${n} na coleção`)],
  ].filter(([, n]) => n);
  $("[data-resumo]").innerHTML = resumo.map(([s, n, f]) => `<li><a href="#${s}">${f(n)}</a></li>`).join("");

  $("[data-curiosidades]").innerHTML = curiosidades
    .map((c) => {
      const r = relogios.find((x) => x.id === c.relogio);
      return `<article class="curiosidade">
        ${c.foto ? `<img src="${esc(c.foto)}" alt="" loading="lazy">` : ""}
        <h3>${comNum(c.titulo)}</h3>
        <p>${esc(c.texto)}</p>
        ${r ? `<a class="curiosidade-link" href="#relogio/${esc(r.id)}">Ver o ${esc(nomeCompleto(r))}</a>` : ""}
      </article>`;
    })
    .join("");

  $$("[data-whatsapp]").forEach((a) => {
    a.href = linkWhatsApp("Olá! Vi a vitrine da Magno Watches e queria conversar sobre relógios.");
    a.target = "_blank";
    a.rel = "noopener";
  });
  const insta = $("[data-instagram]");
  const usuario = (config.instagram || "").replace(/^@/, "").trim();
  if (usuario) {
    insta.hidden = false;
    insta.href = `https://instagram.com/${encodeURIComponent(usuario)}`;
    insta.textContent = `@${usuario}`;
  }
  $("[data-cidade]").textContent = config.cidade || "";
}

/* ---------- detalhes ---------- */

function detalheHTML(r) {
  const fotos = r.fotos?.length ? r.fotos : [];
  const specs = [
    ["Referência", r.referencia],
    ["Ano", r.ano],
    ["Caixa", r.caixa],
    ["Material", r.material],
    ["Movimento", r.movimento],
    ["Pulseira", r.pulseira],
    ["Acompanha", r.kit],
    ["Estado", r.condicao],
  ].filter(([, v]) => v);

  const acao = {
    venda: ["Quero este relógio", "botao-metal"],
    chegando: ["Reservar este relógio", "botao-metal"],
    colecao: ["Perguntar sobre ele", "botao-linha"],
    vendido: ["Quero um parecido", "botao-linha"],
  }[r.status];

  let preco = "";
  if (r.status === "venda" || r.status === "chegando") preco = brl(r.preco) || "Preço sob consulta";
  const situacao =
    r.status === "chegando" && r.previsao
      ? `Chegando, previsão para ${previsao(r.previsao)}`
      : STATUS[r.status];

  return `
  <div class="galeria">
    <div class="galeria-principal">
      ${fotos.length ? `<img src="${esc(fotos[0])}" alt="${esc(nomeCompleto(r))}, foto 1 de ${fotos.length}" data-foto-principal>` : `<span class="sem-foto">Sem foto</span>`}
    </div>
    ${
      fotos.length > 1
        ? `<div class="miniaturas" role="group" aria-label="Fotos">
        ${fotos.map((f, i) => `<button type="button" data-foto="${i}" aria-label="Foto ${i + 1}" aria-current="${i === 0}"><img src="${esc(f)}" alt=""></button>`).join("")}
      </div>`
        : ""
    }
  </div>
  <div class="ficha">
    <p class="ficha-situacao" data-status="${esc(r.status)}">${esc(situacao)}</p>
    <p class="ficha-marca">${esc(r.marca)}</p>
    <h2 class="ficha-modelo" id="detalhe-titulo">${comNum(r.modelo)}</h2>
    ${preco ? `<p class="ficha-preco">${esc(preco)}</p>` : ""}
    ${r.descricao ? `<p class="ficha-descricao">${esc(r.descricao)}</p>` : ""}
    <div class="ficha-acoes">
      <a class="botao ${acao[1]}" href="${esc(linkWhatsApp(mensagemPara(r)))}" target="_blank" rel="noopener">${acao[0]}</a>
      <button class="botao botao-linha" type="button" data-compartilhar>Compartilhar</button>
    </div>
    ${specs.length ? `<dl class="ficha-specs">${specs.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
  </div>`;
}

function abrirDetalhe(id) {
  const r = acervo.relogios.find((x) => x.id === id);
  const dlg = $("#detalhe");
  if (!r) return;
  const corpo = $("[data-detalhe]");
  corpo.innerHTML = detalheHTML(r);
  corpo.scrollTop = 0;
  if (!dlg.open) dlg.showModal();
  document.title = `${nomeCompleto(r)} · Magno Watches`;

  const principal = $("[data-foto-principal]", corpo);
  const trocar = (i) => {
    const n = r.fotos.length;
    i = (i + n) % n;
    principal.src = r.fotos[i];
    principal.alt = `${nomeCompleto(r)}, foto ${i + 1} de ${n}`;
    $$("[data-foto]", corpo).forEach((b) => b.setAttribute("aria-current", String(Number(b.dataset.foto) === i)));
    trocar.atual = i;
  };
  trocar.atual = 0;
  $$("[data-foto]", corpo).forEach((b) => b.addEventListener("click", () => trocar(Number(b.dataset.foto))));
  dlg.onkeydown = (e) => {
    if (!principal || r.fotos.length < 2) return;
    if (e.key === "ArrowRight") trocar(trocar.atual + 1);
    if (e.key === "ArrowLeft") trocar(trocar.atual - 1);
  };

  // deslizar para trocar foto no celular
  if (principal) {
    let x0 = null;
    principal.addEventListener("touchstart", (e) => (x0 = e.touches[0].clientX), { passive: true });
    principal.addEventListener("touchend", (e) => {
      if (x0 === null || r.fotos.length < 2) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 40) trocar(trocar.atual + (dx < 0 ? 1 : -1));
      x0 = null;
    });
  }

  $("[data-compartilhar]", corpo).addEventListener("click", async () => {
    const url = linkRelogio(r);
    if (navigator.share) {
      try {
        await navigator.share({ title: nomeCompleto(r), text: `${nomeCompleto(r)} na Magno Watches`, url });
      } catch {}
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      avisar("Link copiado");
    } catch {
      prompt("Copie o link:", url);
    }
  });
}

function fecharDetalhe() {
  const dlg = $("#detalhe");
  if (dlg.open) dlg.close();
}

function lerEndereco() {
  const m = location.hash.match(/^#relogio\/(.+)$/);
  if (m) abrirDetalhe(decodeURIComponent(m[1]));
  else fecharDetalhe();
}

function ligarDetalhe() {
  const dlg = $("#detalhe");
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#relogio/"]');
    if (a) abriuPorClique = true;
  });
  $("[data-fechar]").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) dlg.close();
  });
  dlg.addEventListener("close", () => {
    document.title = acervo.config.nome || "Magno Watches";
    if (!location.hash.startsWith("#relogio/")) return;
    if (abriuPorClique) {
      abriuPorClique = false;
      history.back();
    } else {
      history.replaceState(null, "", location.pathname + location.search);
    }
  });
  addEventListener("hashchange", lerEndereco);
}

/* ---------- início ---------- */

async function iniciar() {
  montarMostrador();
  ligarDetalhe();
  try {
    const resp = await fetch(`${ARQUIVO_ACERVO}?v=${Date.now()}`, { cache: "no-store" });
    if (!resp.ok) throw new Error(resp.status);
    acervo = await resp.json();
  } catch (e) {
    $("#conteudo").insertAdjacentHTML(
      "afterbegin",
      `<p class="vazio">Não foi possível carregar os relógios. Atualize a página para tentar de novo.</p>`
    );
    return;
  }
  renderizar();
  lerEndereco();
}

iniciar();
