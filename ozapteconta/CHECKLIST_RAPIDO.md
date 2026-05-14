# âš¡ ozapteconta - Checklist RÃ¡pido de InstalaÃ§Ã£o

## ðŸŽ¯ ANTES DE COMEÃ‡AR (5 MINUTOS)

### âœ… VerificaÃ§Ã£o 1: Node.js Instalado?

```cmd
node --version
```

**Resultado esperado:** `v20.18.0` ou superior

**Se FALHAR:**
1. Baixar: https://nodejs.org/en/download
2. Instalar: Executar `node-v20.x.x-x64.msi`
3. Marcar: "Add to PATH"
4. Reiniciar Command Prompt
5. Testar novamente: `node --version`

---

### âœ… VerificaÃ§Ã£o 2: PostgreSQL Instalado?

```cmd
psql --version
```

**Resultado esperado:** `psql (PostgreSQL) 16.x`

**Se FALHAR:**
1. Baixar: https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
2. Instalar: Executar `postgresql-16.x-windows-x64.exe`
3. Senha superusuÃ¡rio: **`Tra1302`** (IMPORTANTE!)
4. Marcar: "Command Line Tools"
5. Instalar completo
6. Reiniciar Command Prompt
7. Testar novamente: `psql --version`

---

### âœ… VerificaÃ§Ã£o 3: PostgreSQL Rodando?

```cmd
tasklist | find /i "postgres"
```

**Resultado esperado:** `postgres.exe` na lista

**Se FALHAR:**
- Procurar "Services" no Windows
- Encontrar "postgresql-x64-16"
- Clicar com botÃ£o direito â†’ "Start"
- Ou executar:
  ```cmd
  net start postgresql-x64-16
  ```

---

### âœ… VerificaÃ§Ã£o 4: Portas Livres?

```cmd
netstat -ano | findstr ":3001"
netstat -ano | findstr ":5173"
```

**Resultado esperado:** Lista vazia (nenhum resultado)

**Se tiver resultado:**
- Nota o PID do processo
- Executar: `taskkill /PID {PID} /F`

---

## ðŸš€ INSTALAÃ‡ÃƒO (5 CLIQUES)

### Passo 1: Abrir Command Prompt
1. Pressionar `Win + R`
2. Digitar: `cmd`
3. Pressionar Enter

### Passo 2: Navegar para Pasta
```cmd
cd "C:\Users\{seu_usuario}\OneDrive\Desktop\Sistemas construidos\wpp finance"
```

### Passo 3: Executar Install.bat
1. Clique **DIREITO** em `install.bat`
2. Selecione **"Executar como administrador"**
3. Digite `S` se pedir confirmaÃ§Ã£o
4. **Aguarde 5-10 minutos**

### Passo 4: Iniciar Sistema
```cmd
iniciar-bg.bat
```

### Passo 5: Acessar Dashboard
- Abrir navegador
- Ir para: http://localhost:3001
- Login: `admin` / `admin123`

---

## âœ¨ SUCESSO!

Se chegou atÃ© aqui, o sistema estÃ¡ funcionando! ðŸŽ‰

### PrÃ³ximas Actions
1. âœ… Alterar senha do admin
2. âœ… Configurar WhatsApp Cloud API
3. âœ… Testar bot via WhatsApp
4. âœ… Selecionar provedor de IA

---

## âŒ PROBLEMA? TESTE ISSO

### Teste 1: Backend respondendo?
```cmd
curl http://localhost:3001/api/health
```

Deve retornar:
```json
{"status":"ok","version":"1.0.0","timestamp":"2026-05-10T..."}
```

### Teste 2: PostgreSQL conectando?
```cmd
psql -U financebot -d financebot -c "SELECT 1;"
```

Deve retornar: `1`

### Teste 3: Ver logs de erro
```cmd
type backend\logs\app.log
```

### Teste 4: Reiniciar tudo
```cmd
parar.bat
iniciar-bg.bat
```

---

## ðŸ“– LEIA TAMBÃ‰M

- **GUIA_WINDOWS.md** - Guia completo
- **VERIFICACOES_WINDOWS.md** - Troubleshooting avanÃ§ado
- **ANALISE_OZAPTECONTA.md** - AnÃ¡lise tÃ©cnica completa

---

**Tempo estimado:** 20 minutos  
**Dificuldade:** FÃ¡cil âœ…  
**Status:** Pronto para rodar ðŸš€

