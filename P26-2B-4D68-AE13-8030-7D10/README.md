# Projeto #27: Entrelinhas — Blog Técnico da Turma

- **Modalidade:** Projeto Oficial Sorteado (Valendo 100 pontos)
- **Estudante:** LUIS FERNANDO PRATES SANTANA
- **Turma:** 2B
- **Chave Única:** `P26-2B-4D68-AE13-8030-7D10`
- **URL_CLOUDFLARE:** `https://p26-2b-4d68-ae13-8030-7d10.pages.dev` *(Atualize com a URL pública real do seu deploy na Cloudflare antes de abrir o Pull Request)*

---

## Funcionalidades

- Feed público de artigos e páginas individuais de autor.
- Editor de artigos com escrita em Markdown, pré-visualização, edição e exclusão pelo autor.
- Comentários com nome e avatar do Discord, em ordem cronológica, e curtidas por usuário.
- Salas públicas e privadas: salas privadas exigem convite, e seus artigos e comentários são visíveis somente aos membros.
- Autenticação Discord OAuth2 com validação `state`, sessão assinada e cookie `HttpOnly`.
- Regras de propriedade, participação em salas e autorização verificadas nas Pages Functions; dados persistidos no Cloudflare D1.

---

## Como Publicar esta Subpasta no Cloudflare Pages + D1 + Discord OAuth2

Para instruções detalhadas sobre quais valores configurar e exatamente onde inseri-los, siga o guia [Configuração Cloudflare, D1 e Discord](./docs/configuracao-cloudflare-discord.md).

1. No painel da Cloudflare (**Workers & Pages** → **Create** → **Pages** → **Connect to Git**), selecione o seu fork do repositório `Avalia2026-2`.
2. Configure os parâmetros de build apontando para esta subpasta:
   - **Root directory (Diretório raiz):** `P26-2B-4D68-AE13-8030-7D10`
   - **Build command:** *(deixe em branco — HTML/CSS/JS puro)*
   - **Build output directory:** `public`
3. Crie o banco de dados D1, atualize o `database_id` no `wrangler.jsonc` e aplique as migrações:
   ```powershell
   cd P26-2B-4D68-AE13-8030-7D10
   npx.cmd wrangler d1 create db-p26-2b-4d68-ae13-8030-7d10
   # Copie o database_id gerado para o wrangler.jsonc e aplique as migrações:
   npx.cmd wrangler d1 migrations apply DB --remote
   ```
4. **Vincule o Banco D1 ao seu Cloudflare Pages (Obrigatório para ativar env.DB):**
   - No painel da Cloudflare: acesse seu projeto Pages → **Settings** → **Functions** → **D1 database bindings**.
   - Clique em **Add binding**:
     - **Variable name:** `DB`
     - **D1 database:** selecione o banco que você criou (`db-p26-2b-4d68-ae13-8030-7d10`).
5. **Configuração do Discord OAuth2 (Obrigatório para autenticação real):**
   - Acesse o **Discord Developer Portal** (https://discord.com/developers/applications) e crie uma nova Application.
   - Na aba **OAuth2**:
     - Copie o **Client ID** e gere o **Client Secret**.
     - Em **Redirects**, adicione a URL exata do deploy:
       `https://p26-2b-4d68-ae13-8030-7d10.pages.dev/api/auth/discord/callback`
   - No painel do seu projeto Cloudflare Pages, acesse **Settings** → **Variables and Secrets** e configure:
     - `DISCORD_CLIENT_ID` como variável.
     - `DISCORD_CLIENT_SECRET` como secret.
     - `SESSION_SECRET` como secret aleatório com no mínimo 32 caracteres. Gere localmente com:
       ```powershell
       node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
       ```
       Não salve esse valor no repositório. Configure-o como secret de produção e, se usar preview deployments, configure também no ambiente Preview.
6. Atualize o campo **URL_CLOUDFLARE** no topo deste `README.md` com o endereço público gerado pela Cloudflare.
7. Na raiz do repositório, execute `node validar-local.mjs P26-2B-4D68-AE13-8030-7D10` para validar todos os critérios antes de fazer o commit e abrir o Pull Request.

## Uso das salas

Qualquer pessoa autenticada pode criar uma sala pública ou privada. Salas públicas podem ser abertas e acompanhadas por todos. Ao criar uma sala privada, o blog mostra uma única vez o ID da sala e seu código de convite; compartilhe ambos somente com as pessoas que devem participar. Os artigos publicados dentro de uma sala privada, assim como seus comentários, ficam restritos aos membros.

## Markdown

O editor aceita títulos (`#`), listas, citações (`>`), blocos cercados por três crases, código inline (`` `código` ``), **negrito**, *itálico* e links HTTP/HTTPS. A visualização prévia usa o mesmo renderizador local do artigo; HTML inserido como texto não é interpretado como marcação executável.
