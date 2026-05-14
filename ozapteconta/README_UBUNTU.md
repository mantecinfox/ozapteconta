# ðŸš€ ozapteconta - InstalaÃ§Ã£o Ubuntu 20.04

## âš¡ COMECE AQUI EM 3 MINUTOS

### ðŸªŸ Windows - Passo 1 (5 minutos)

Abra **PowerShell** e execute:

```powershell
cd "C:\Users\mante\OneDrive\Desktop\Sistemas construidos\wpp finance"
.\transfer-to-ubuntu.ps1
```

âœ… Isso copia seus arquivos para o servidor Ubuntu via SSH

---

### ðŸ§ Ubuntu - Passo 2 (15 minutos)

Conecte via SSH e execute:

```bash
ssh pc@192.168.4.100
cd /home/pc/financebot
chmod +x install-ubuntu.sh
./install-ubuntu.sh
```

âœ… Isso instala tudo automaticamente (Node, BD, dependÃªncias)

---

### â–¶ï¸ Ubuntu - Passo 3 (1 minuto)

Inicie o sistema:

```bash
./start-all.sh
```

âœ… Backend rodando em `http://192.168.4.100:3001`  
âœ… Frontend rodando em `http://192.168.4.100:5173`

---

## ðŸŒ Acessar Agora

| Item | URL |
|------|-----|
| **Frontend** | http://192.168.4.100:5173 |
| **Backend** | http://192.168.4.100:3001 |

**Login:** `admin` / `admin123`

---

## ðŸ“š DocumentaÃ§Ã£o

| Documento | Quando Usar |
|-----------|------------|
| **CHECKLIST_UBUNTU_AGORA.md** | Guia passo-a-passo detalhado |
| **UBUNTU_GUIA_RAPIDO.md** | ReferÃªncia de comandos |
| **INSTALACAO_UBUNTU_SSH.md** | Guia completo com detalhes |
| **PRODUCAO_NGINX.md** | Setup em produÃ§Ã£o com NGINX |
| **INDICE_UBUNTU.md** | NavegaÃ§Ã£o de todos os docs |

---

## ðŸ†˜ Algo NÃ£o Funcionou?

### Execute diagnÃ³stico no Ubuntu

```bash
cd /home/pc/financebot
chmod +x diagnose-ubuntu.sh
./diagnose-ubuntu.sh
```

### Consulte troubleshooting

Abra: **UBUNTU_GUIA_RAPIDO.md** â†’ SeÃ§Ã£o `ðŸ†˜ Troubleshooting`

---

## ðŸ“‹ Checklist RÃ¡pido

- [ ] Executei `transfer-to-ubuntu.ps1` no Windows
- [ ] Executei `install-ubuntu.sh` no Ubuntu  
- [ ] Executei `./start-all.sh`
- [ ] Consigo acessar http://192.168.4.100:5173
- [ ] Login funciona (admin/admin123)

---

## ðŸŽ¯ PrÃ³ximos Passos

1. **Configure WhatsApp**
   - Acesse: http://192.168.4.100:3001/api/admin/whatsapp/qr-link

2. **Configure Payment Gateway** (opcional)
   - Acesse: http://192.168.4.100:3001/api/admin/payment-gateways

3. **Para ProduÃ§Ã£o**
   - Leia: **PRODUCAO_NGINX.md**

---

## ðŸ’¾ Credenciais PadrÃ£o

```
SSH:    pc@192.168.4.100
Admin:  admin / admin123
DB:     finance / financepassword123
```

---

## ðŸ†˜ Precisa de Ajuda?

- **ComeÃ§ar do zero**: Leia `CHECKLIST_UBUNTU_AGORA.md`
- **ReferÃªncia rÃ¡pida**: Leia `UBUNTU_GUIA_RAPIDO.md`
- **Erro especÃ­fico**: Busque em `UBUNTU_GUIA_RAPIDO.md`
- **DiagnÃ³stico**: Execute `diagnose-ubuntu.sh`

---

**ðŸŽ‰ Pronto! VocÃª tem tudo para instalar!**


