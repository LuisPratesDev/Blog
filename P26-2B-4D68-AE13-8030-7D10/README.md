# Projeto #27: Entrelinhas — Blog Técnico da Turma

- **Modalidade:** Projeto Oficial Sorteado (Valendo 100 pontos)
- **Estudante:** LUIS FERNANDO PRATES SANTANA
- **Turma:** 2B
- **Chave Única:** `P26-2B-4D68-AE13-8030-7D10`
- **URL_CLOUDFLARE:** `https://p26-2b-4d68-ae13-8030-7d10.pages.dev` *(Atualize com a URL pública real do seu deploy na Cloudflare antes de abrir o Pull Request)*

---

## Funcionalidades

- Feed público de artigos e páginas individuais de autor, com busca por texto, etiquetas e paginação por cursor.
- Editor de artigos com escrita em Markdown, pré-visualização, rascunho automático no navegador, etiquetas e histórico de revisões.
- Comentários com nome e avatar do Discord, em ordem cronológica, curtidas por usuário, exclusão pelo autor/artigo/dono da sala e denúncia.
- Salas públicas e privadas: salas privadas exigem convite, e seus artigos e comentários são visíveis somente aos membros. Membro pode sair, o dono pode transferir ou excluir a sala (os artigos voltam para a página pública).
- Controle de entrada por política (`open_link` ou `approval`) com fila de pedidos, remoção com bloqueio e liberação posterior.
- Autenticação Discord OAuth2 com validação `state`, sessão assinada e cookie `HttpOnly` (e `Secure` em https).
- Regras de propriedade, participação em salas e autorização verificadas nas Pages Functions; dados persistidos no Cloudflare D1.
- SEO: RSS, `sitemap.xml`, `robots.txt` e metadados Open Graph por artigo; `GET /api/health` para diagnóstico do deploy.
- Repositório sem dependências de build: apenas HTML/CSS/JS e Pages Functions, pronto para o deploy direto pelo Cloudflare Pages.
- Cabeçalhos de segurança em `public/_headers` (CSP, `nosniff`, `X-Frame-Options`, `Referrer-Policy`, HSTS) e middleware que registra erros 5xx com id de requisição.

---

## Banco de dados

O schema completo do D1 está documentado em Markdown em [docs/schema-d1-e-orientacoes.md](./docs/schema-d1-e-orientacoes.md) e como SQL executável em [`schema.sql`](./schema.sql). O banco é criado e vinculado **pelo painel da Cloudflare**: o projeto não tem Wrangler nem arquivo de configuração dele, então nenhum UUID de banco vai para o repositório (era isso que gerava `Error 8000022: Invalid database UUID`).

---

## Desenvolvimento local

Pré-requisitos: Node.js 20+ e uma aplicação Discord OAuth2 criada (passo 5 do guia abaixo).

```powershell
npm test             # testes unitários (node:test), sem instalar nada
npm run dev:local    # sobe as Pages Functions localmente em http://127.0.0.1:8788
npm run test:e2e     # validação ponta a ponta contra esse servidor local
npm run validate     # npm test + validar-local.mjs na raiz do repositório
```

O projeto não tem dependências e não usa Wrangler. Os testes unitários rodam sem banco: o D1 é simulado. Para o ponta a ponta, `tests/server-local.mjs` executa as próprias Pages Functions no Node, com um D1 em `node:sqlite` criado a partir de `schema.sql` e os dois usuários de teste já inseridos — em outro terminal, rode `npm run dev:local` e depois `npm run test:e2e`. O servidor local lê `SESSION_SECRET` do `.env`.

CI e publicação: [docs/ci-e-publicacao.md](./docs/ci-e-publicacao.md).

As credenciais do Discord e o segredo da sessão ficam apenas no painel do Cloudflare Pages (Settings → Variables and Secrets) para o site publicado. O `.env` (copie de `.env.example`) é usado somente pelos testes locais e nunca vai para o Git nem para a Cloudflare.

`seed/demo-local.sql` é uma referência de dados de exemplo (usuário demo, sala pública **Desenvolvimento Web**, sala privada **Projeto Integrador**). Use apenas em um banco de desenvolvimento, nunca em produção.

## Como Publicar esta Subpasta no Cloudflare Pages + D1 + Discord OAuth2

Para instruções detalhadas sobre quais valores configurar e exatamente onde inseri-los, siga o guia [Configuração Cloudflare, D1 e Discord](./docs/configuracao-cloudflare-discord.md). O schema completo do banco, em Markdown, está em [Schema do D1 e orientações](./docs/schema-d1-e-orientacoes.md).

1. No painel da Cloudflare (**Workers & Pages** → **Create** → **Pages** → **Connect to Git**), selecione o seu fork do repositório `Avalia2026-2`. Configure e salve o projeto; o primeiro deploy pode ser feito sem banco.
2. Configure os parâmetros de build apontando para esta subpasta:
   - **Root directory (Diretório raiz):** `P26-2B-4D68-AE13-8030-7D10`
   - **Build command:** *(deixe em branco — HTML/CSS/JS puro)*
   - **Build output directory:** `public`
3. Crie o banco D1 no painel (**Workers & Pages** → **D1** → **Create database**) com o nome `db-p26-2b-4d68-ae13-8030-7d10` e aplique o schema:
   - Abra o banco → aba **Console** → cole o conteúdo de [`schema.sql`](./schema.sql) → **Execute**.
   - O mesmo SQL, tabela por tabela, está em [docs/schema-d1-e-orientacoes.md](./docs/schema-d1-e-orientacoes.md).
4. Associe o banco ao projeto Pages em **Settings** → **Bindings** → **Add** → **D1 database bindings**: variável `DB`, banco `db-p26-2b-4d68-ae13-8030-7d10`.
   - O projeto não tem arquivo de configuração de Wrangler: o Pages usa as configurações de build do passo 2 e o binding vive no painel, então o deploy não tenta validar UUID nenhum.
5. **Configuração do Discord OAuth2 (Obrigatório para autenticação real):**
   - Acesse o **Discord Developer Portal** (https://discord.com/developers/applications) e crie uma nova Application.
   - Na aba **OAuth2**:
     - Copie o **Client ID** e o **Client Secret**. Você pode deixar o callback para depois do primeiro deploy: a URL Pages pode ainda não aparecer e o callback não é necessário para publicar.
   - Para os testes locais, copie `.env.example` para `.env` e preencha `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` e `SESSION_SECRET`.
   - Para produção, configure esses mesmos nomes no Cloudflare Pages → **Settings** → **Variables and Secrets**. O Client ID é variável; Client Secret e SESSION_SECRET são Secrets. O `.env` local não é enviado ao Cloudflare. Consulte o guia para os comandos e passos detalhados.
6. Depois de configurar o binding `DB` e as variáveis de produção, faça (ou refaça) o deploy. A URL `pages.dev` fica disponível na página do projeto Pages ou nos detalhes desse deploy.
7. Com a URL real em mãos, abra a aplicação Discord → **OAuth2** → **Redirects** e adicione `https://SEU-DOMINIO-PAGES.pages.dev/api/auth/discord/callback`. Substitua `SEU-DOMINIO-PAGES` pelo domínio exato mostrado pela Cloudflare e salve. Não precisa fazer outro deploy por causa dessa alteração no Discord. Atualize o campo **URL_CLOUDFLARE** no topo deste `README.md`.
8. Confira `https://SEU-DOMINIO.pages.dev/api/health` (`status: ok`) e, na raiz do repositório, execute `node validar-local.mjs P26-2B-4D68-AE13-8030-7D10` para validar todos os critérios antes do commit e do Pull Request.

## Uso das salas

Qualquer pessoa autenticada pode criar uma sala pública ou privada. Salas públicas podem ser abertas e acompanhadas por todos. Sala privada funciona **só pelo ID**: quem tiver o número da sala usa o campo de entrada do painel lateral e entra (ou envia um pedido, se o dono escolher “somente quem eu aprovar”). Não existe código de convite. Os artigos publicados dentro de uma sala privada, assim como seus comentários, ficam restritos aos membros.

## Markdown

O editor aceita títulos (`#`), listas, citações (`>`), blocos cercados por três crases, código inline (`` `código` ``), **negrito**, *itálico*, links HTTP/HTTPS e **tabelas** (colunas separadas por `|` e uma linha de `---` abaixo do cabeçalho). A visualização prévia usa o mesmo renderizador do artigo.

**HTML** entra em blocos ```` ```html ````. Ele é sanitizado por uma lista fechada: títulos, parágrafos, listas, tabelas, `figure`/`figcaption`, `details`, links e imagens `https`, além de SVG, são mantidos; `script`, `style`, `iframe`, `object`, `form` e atributos `on*`/`style` são removidos, e URL fora de `http(s)` é descartada. Fora de um bloco ```` ```html ````, HTML digitado no texto continua aparecendo como texto.

Blocos ```` ```svg ```` são exibidos como imagem (o navegador não executa scripts dentro de `<img>`), com limite de 40.000 caracteres e altura máxima de 70% da tela. O SVG deve começar em `<svg` e terminar em `</svg>`; caso contrário volta a aparecer como código. Um `<svg>` inline dentro do bloco ```` ```html ```` também é renderizado.

## Busca, etiquetas e paginação

O feed carrega 10 artigos por vez com **Carregar mais** (cursor por data/id). A busca usa `?q=` (2 a 80 caracteres, título e conteúdo) e as etiquetas usam `?tag=`; o painel lateral lista as etiquetas mais usadas e o editor aceita até 5 por artigo.

## Histórico de edições

Cada `PUT` em um artigo guarda o texto anterior em `article_revisions`. O botão **Histórico** no editor lista as versões (data e autor) e permite carregar uma delas de volta — nada é sobrescrito até você salvar.

## Salas: sair, transferir e excluir

Quem participa pode sair da sala (e pedir entrada de novo depois). O dono transfere a sala para outro membro ou exclui; ao excluir, os artigos **não** somem, voltam para a página pública do blog.

## Saúde, RSS e SEO

- `GET /api/health` responde `status: ok` quando o D1 responde.
- `/feed.xml` publica os 20 artigos mais recentes visíveis sem login; artigos de sala privada ficam de fora.
- `/sitemap.xml` e `/robots.txt` para indexação; artigos de sala privada saem com `noindex`.
