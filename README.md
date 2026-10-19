# Magno Watches

Vitrine pessoal de relógios: os que estão **à venda**, os que estão **chegando**, a **coleção** e **curiosidades**. Quem visita pode abrir cada relógio, ver as fotos e falar com você no WhatsApp com a mensagem já pronta.

Sem framework, sem build, sem banco de dados. É HTML, CSS e JavaScript puros, hospedados de graça no GitHub Pages. Os relógios ficam em um único arquivo, `data/acervo.json`, e as fotos na pasta `fotos/`.

## O que tem no site

- **Abertura** com o emblema da marca funcionando como mostrador: os ponteiros abrem em 10h10 (a pose clássica das fotos de relógio) e deslizam até a hora certa.
- **À venda**, com filtro por marca, preço e uma faixa discreta de “Já foram vendidos”.
- **Chegando**, com a previsão de chegada e botão para reservar.
- **Coleção**, sem preço.
- **Curiosidades**, que podem apontar para um relógio da vitrine.
- **Detalhes de cada relógio**: galeria de 3 ou 4 fotos (setas do teclado ou deslizar no celular), ficha técnica, botão de WhatsApp e botão de compartilhar. Cada relógio tem link próprio (`.../#relogio/submariner-date`), bom para mandar no WhatsApp ou no Instagram.
- **Botão de WhatsApp** com mensagem pronta para cada situação: comprar, reservar, perguntar sobre a coleção ou pedir um parecido com um já vendido.

## Primeiro passo: colocar no ar

1. No GitHub, abra o repositório e vá em **Settings › Pages**.
2. Em **Build and deployment**, escolha **Deploy from a branch**, branch **main**, pasta **/ (root)**, e salve.
3. Em um ou dois minutos o site fica em **https://lucaasaragao.github.io/magno-watches/**.

## Painel: só você altera

O painel fica em **https://lucaasaragao.github.io/magno-watches/admin.html**. Qualquer pessoa consegue abrir a página, mas só altera quem tiver a sua chave de acesso do GitHub.

**Criar a chave (uma vez só):**

1. Abra https://github.com/settings/personal-access-tokens/new
2. Nome: “Painel Magno Watches”. Escolha a validade (pode ser 1 ano).
3. **Repository access › Only select repositories** → `magno-watches`.
4. **Permissions › Repository permissions › Contents** → **Read and write**.
5. **Generate token**, copie e cole no painel. Com “Lembrar neste aparelho” marcado, você não precisa colar de novo.

**No painel você pode:**

- adicionar, editar e remover relógios (até 30);
- subir até 4 fotos por relógio, escolher a capa e a ordem. As fotos são reduzidas para 1600 px e convertidas para WebP no próprio celular antes de enviar, então ficam leves;
- mudar a situação (À venda, Chegando, Coleção, Vendido) direto na lista;
- mudar a ordem dos relógios no site;
- escrever curiosidades;
- configurar WhatsApp, Instagram, cidade e o texto de apresentação.

As mudanças ficam guardadas no painel até você tocar em **Publicar no site**. Aí elas viram um commit no repositório e o site atualiza em cerca de um minuto. Fotos de relógios removidos são apagadas do repositório automaticamente.

## Antes de divulgar

- [ ] Ativar o GitHub Pages (acima).
- [ ] No painel, em **Contato e textos**, preencher o **WhatsApp** (com 55 e DDD). Sem ele, o botão abre o WhatsApp pedindo para a pessoa escolher o contato.
- [ ] Preencher Instagram e cidade.
- [ ] Trocar os **relógios de exemplo** pelos seus. Os 9 relógios que vêm no site são ilustrações com a palavra “EXEMPLO” no mostrador; preços e textos também são de exemplo. Remova-os pelo painel.
- [ ] Revisar as curiosidades (são verdadeiras, mas são suas para editar).

## Decisões que tomei

- **Nome e marca.** O site usa “Magno Watches”, como você pediu. A sua logo diz “Magno Timepieces”, então recriei só o emblema (o M dentro do círculo com as quatro marcações) em vetor, em `assets/emblema.svg`, para ficar nítido em qualquer tamanho e sem o ícone de lápis que estava no print. Se quiser usar o arquivo original, é só colocá-lo em `assets/` e trocar o caminho no `index.html`.
- **Visual.** Preto e prata, como a logo. A página é aço escuro e o preto puro fica reservado ao “disco”: o mostrador da abertura, o fundo das fotos e o rodapé. Títulos em Marcellus (da mesma família de letras romanas do “M” da logo) e textos em Hanken Grotesk.
- **Sem banco de dados.** Com até 30 relógios, um arquivo JSON no próprio repositório é o mais simples e não custa nada. O painel conversa direto com a API do GitHub, então não existe servidor para manter.
- **Chegando** aparece em cartões largos, com a previsão em destaque, para não se confundir com os que já estão à venda.

## Estrutura

```
index.html          vitrine
admin.html          painel
css/style.css       visual da vitrine (cores e fontes no topo do arquivo)
css/admin.css       visual do painel
js/app.js           vitrine
js/admin.js         painel e publicação no GitHub
js/config.js        repositório e branch usados pelo painel
data/acervo.json    relógios, curiosidades e contato
fotos/              fotos dos relógios
assets/emblema.svg  emblema da marca
```

## Testar no computador

```bash
python3 -m http.server 8080
# abra http://localhost:8080
```
