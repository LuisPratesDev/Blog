# Configuração Cloudflare, D1 e Discord

Siga os passos na ordem. Eles indicam quais valores são necessários e exatamente onde configurá-los para publicar o blog.

## 1. Criar o projeto Cloudflare Pages

1. Abra o painel da Cloudflare e acesse **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
2. Selecione o repositório Git onde está o projeto.
3. Configure o build:
   - **Project name:** escolha o nome do seu projeto Cloudflare Pages.
   - **Production branch:** selecione a branch que será publicada.
   - **Root directory (advanced):** `P26-2B-4D68-AE13-8030-7D10`
   - **Build command:** deixe em branco.
   - **Build output directory:** `public`
4. Salve e faça o primeiro deploy.
5. Anote a URL publicada, por exemplo `https://nome-do-projeto.pages.dev`. Use essa mesma URL nos passos do Discord.

## 2. Criar o banco D1 e registrar seu ID

No PowerShell, na raiz do repositório:

```powershell
cd "D:\C# Programs\Blog"
npx.cmd wrangler d1 create db-p26-2b-4d68-ae13-8030-7d10
```

O comando exibe um `database_id`, normalmente no formato UUID. Copie o valor retornado.

Abra `P26-2B-4D68-AE13-8030-7D10/wrangler.jsonc` e substitua somente o valor de `database_id` no objeto `d1_databases`:

```jsonc
"database_id": "COLE_AQUI_O_DATABASE_ID_RETORNADO"
```

Não altere o valor `"binding": "DB"` nem o nome do banco. Salve o arquivo. O `database_id` não é uma senha, mas precisa corresponder ao banco criado na sua conta Cloudflare.

## 3. Aplicar as tabelas no D1 remoto

No PowerShell, aplique as migrações usando o binding `DB` definido no `wrangler.jsonc`:

```powershell
cd "D:\C# Programs\Blog\P26-2B-4D68-AE13-8030-7D10"
npx.cmd wrangler d1 migrations apply DB --remote
```

Confirme a aplicação das migrações `0001_init.sql` e `0002_blog.sql` quando o Wrangler solicitar. Não crie as tabelas manualmente no painel.

## 4. Vincular o banco ao projeto Pages

No painel Cloudflare:

1. Abra **Workers & Pages** e selecione o projeto Pages criado no passo 1.
2. Acesse **Settings** → **Functions** → **D1 database bindings**.
3. Clique em **Add binding** e preencha:
   - **Variable name:** `DB`
   - **D1 database:** `db-p26-2b-4d68-ae13-8030-7d10`
4. Salve a configuração e faça um novo deploy do projeto.

O nome `DB` diferencia maiúsculas de minúsculas e deve ser exatamente esse. O banco selecionado precisa ser o mesmo cujo ID você colocou no `wrangler.jsonc`.

## 5. Criar a aplicação OAuth2 no Discord

1. Abra o [Discord Developer Portal](https://discord.com/developers/applications).
2. Clique em **New Application**, dê um nome e crie a aplicação.
3. Abra **OAuth2** e copie o **Client ID**.
4. Na mesma seção, gere/copie o **Client Secret**. Trate-o como senha; não o publique.
5. Em **OAuth2** → **Redirects**, adicione o endereço de callback usando a URL Pages publicada no passo 1:

   ```text
   https://SEU-PROJETO.pages.dev/api/auth/discord/callback
   ```

   Por exemplo, se sua URL for `https://meu-blog.pages.dev`, cadastre `https://meu-blog.pages.dev/api/auth/discord/callback`.

6. Salve as alterações no Discord.

O endereço cadastrado precisa corresponder exatamente ao domínio que os usuários usarão, incluindo `https://`, caminho e domínio. Se também for usar um domínio personalizado ou autenticação em Preview deployments, cadastre os respectivos callbacks exatos no Discord e configure as variáveis para esses ambientes.

## 6. Gerar o segredo da sessão

No PowerShell, execute:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Copie o valor aleatório impresso. Ele será o `SESSION_SECRET`. Gere um valor próprio; não reutilize o exemplo de outra pessoa, não o envie no chat e não o coloque em arquivos versionados.

## 7. Configurar as variáveis e secrets no Cloudflare Pages

No painel Cloudflare:

1. Abra **Workers & Pages** → seu projeto → **Settings** → **Variables and Secrets**.
2. Selecione o ambiente **Production**.
3. Adicione os seguintes valores:

   | Nome | Tipo no Cloudflare | Valor |
   | --- | --- | --- |
   | `DISCORD_CLIENT_ID` | Variable / texto | O Client ID copiado do Discord |
   | `DISCORD_CLIENT_SECRET` | Secret | O Client Secret copiado do Discord |
   | `SESSION_SECRET` | Secret | O valor aleatório gerado no passo 6 |

4. Salve as alterações e faça um novo deploy. As Functions recebem esses valores como `env.DISCORD_CLIENT_ID`, `env.DISCORD_CLIENT_SECRET` e `env.SESSION_SECRET`.

Se quiser permitir login nos **Preview deployments**, cadastre também os mesmos três nomes no ambiente **Preview**. Use os segredos apropriados e confirme que o domínio Preview correspondente está autorizado em **OAuth2** → **Redirects** no Discord.

**Nunca** coloque `DISCORD_CLIENT_SECRET` ou `SESSION_SECRET` em `public/`, em JavaScript/HTML, no `wrangler.jsonc`, em commits ou em mensagens públicas. Configure-os como **Secrets** no painel Cloudflare.

## 8. Conferir os endereços e testar

1. Confirme que o callback configurado no Discord é exatamente:

   ```text
   https://SEU-PROJETO.pages.dev/api/auth/discord/callback
   ```

2. Abra a URL Pages publicada e clique em **Entrar com Discord**. Autorize o acesso básico de identidade.
3. Entre com Discord, publique um artigo e, se necessário, teste comentários, curtidas e criação de sala.
4. Atualize o campo `URL_CLOUDFLARE` no início do `README.md` se o domínio real for diferente do exemplo registrado nele.
5. Na raiz do repositório, rode a pré-validação local:

   ```powershell
   cd "D:\C# Programs\Blog"
   node validar-local.mjs P26-2B-4D68-AE13-8030-7D10
   ```

## Valores a configurar — resumo

- **Em `wrangler.jsonc`:** o `database_id` retornado ao criar o D1.
- **No binding D1 do Cloudflare Pages:** nome `DB` apontando para o banco criado.
- **No Discord Developer Portal → OAuth2 → Redirects:** a URL pública completa com `/api/auth/discord/callback`.
- **No Cloudflare Pages → Settings → Variables and Secrets → Production:**
  - `DISCORD_CLIENT_ID` como variável.
  - `DISCORD_CLIENT_SECRET` como secret.
  - `SESSION_SECRET` como secret aleatório com pelo menos 32 caracteres.
- **No Cloudflare Pages → Build configuration:** root `P26-2B-4D68-AE13-8030-7D10`, build command vazio e output `public`.
