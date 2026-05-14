# ðŸš€ ConfiguraÃ§Ã£o de ProduÃ§Ã£o - Ubuntu 20.04 com NGINX

## ðŸ“‹ Ãndice

1. [InstalaÃ§Ã£o NGINX](#instalaÃ§Ã£o-nginx)
2. [ConfiguraÃ§Ã£o Reverse Proxy](#configuraÃ§Ã£o-reverse-proxy)
3. [SSL/HTTPS com Certbot](#sslhttps-com-certbot)
4. [Systemd Services](#systemd-services)
5. [Monitoramento](#monitoramento)
6. [Backup](#backup)

---

## ðŸ”§ InstalaÃ§Ã£o NGINX

```bash
# Instalar NGINX
sudo apt update
sudo apt install -y nginx

# Iniciar NGINX
sudo systemctl start nginx
sudo systemctl enable nginx

# Verificar status
sudo systemctl status nginx

# Testar configuraÃ§Ã£o
sudo nginx -t
```

---

## ðŸ”„ ConfiguraÃ§Ã£o Reverse Proxy

### 1. Criar arquivo de configuraÃ§Ã£o

```bash
sudo nano /etc/nginx/sites-available/financebot
```

### 2. Adicionar configuraÃ§Ã£o

```nginx
upstream backend {
    server 127.0.0.1:3001;
    keepalive 64;
}

upstream frontend {
    server 127.0.0.1:5173;
    keepalive 64;
}

server {
    listen 80;
    listen [::]:80;
    
    server_name 192.168.4.100 financebot.local *.financebot.local;
    
    # Logs
    access_log /var/log/nginx/financebot_access.log;
    error_log /var/log/nginx/financebot_error.log;
    
    # Tamanho mÃ¡ximo de upload
    client_max_body_size 100M;
    
    # â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    # API Backend
    # â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    
    location /api/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts para WebSocket
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
    
    # â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    # Frontend (React/Vite)
    # â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    
    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Para SPA (React Router)
        error_page 404 =200 /index.html;
    }
    
    # â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    # Health Check
    # â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    
    location /health {
        access_log off;
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }
    
    # â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    # SeguranÃ§a
    # â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    
    # Desabilitar acesso a arquivos sensÃ­veis
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }
    
    location ~ ~$ {
        deny all;
        access_log off;
        log_not_found off;
    }
}
```

### 3. Ativar configuraÃ§Ã£o

```bash
# Criar symlink
sudo ln -s /etc/nginx/sites-available/financebot /etc/nginx/sites-enabled/

# Remover default se existir
sudo rm /etc/nginx/sites-enabled/default

# Testar configuraÃ§Ã£o
sudo nginx -t

# Recarregar NGINX
sudo systemctl reload nginx
```

---

## ðŸ”’ SSL/HTTPS com Certbot

### 1. Instalar Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 2. Configurar domÃ­nio (opcional)

Se estiver usando domÃ­nio em vez de IP:

```bash
# Editar hosts do servidor
sudo nano /etc/hosts

# Adicionar:
# 192.168.4.100 financebot.local
```

### 3. Gerar certificado

```bash
# Com DNS (recomendado)
sudo certbot certonly --standalone -d financebot.local

# Ou com webroot
sudo certbot certonly --webroot -w /home/pc/financebot/frontend/dist -d financebot.local
```

### 4. Atualizar NGINX para HTTPS

```bash
sudo nano /etc/nginx/sites-available/financebot
```

Adicionar apÃ³s `listen [::]:80;`:

```nginx
    # Redirecionar HTTP para HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    
    server_name 192.168.4.100 financebot.local;
    
    # Certificados SSL
    ssl_certificate /etc/letsencrypt/live/financebot.local/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/financebot.local/privkey.pem;
    
    # ConfiguraÃ§Ã£o SSL moderna
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # HSTS
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # Resto da configuraÃ§Ã£o igual...
```

### 5. RenovaÃ§Ã£o automÃ¡tica

```bash
# Testar renovaÃ§Ã£o
sudo certbot renew --dry-run

# Certificados sÃ£o renovados automaticamente via cron
sudo systemctl status certbot.timer
```

---

## ðŸ”§ Systemd Services

### 1. Backend Service

```bash
sudo nano /etc/systemd/system/financebot-backend.service
```

Adicionar:

```ini
[Unit]
Description=ozapteconta Backend
After=network.target postgresql.service

[Service]
Type=simple
User=pc
WorkingDirectory=/home/pc/financebot/backend
Environment="NODE_ENV=production"
Environment="PORT=3001"
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
SyslogIdentifier=financebot-backend

[Install]
WantedBy=multi-user.target
```

### 2. Frontend Service

```bash
sudo nano /etc/systemd/system/financebot-frontend.service
```

Adicionar:

```ini
[Unit]
Description=ozapteconta Frontend
After=network.target

[Service]
Type=simple
User=pc
WorkingDirectory=/home/pc/financebot/frontend
ExecStart=/usr/bin/npx http-server dist -p 5173
Restart=always
RestartSec=10
SyslogIdentifier=financebot-frontend

[Install]
WantedBy=multi-user.target
```

### 3. Ativar Services

```bash
sudo systemctl daemon-reload
sudo systemctl enable financebot-backend.service
sudo systemctl enable financebot-frontend.service
sudo systemctl start financebot-backend.service
sudo systemctl start financebot-frontend.service

# Verificar status
sudo systemctl status financebot-backend.service
sudo systemctl status financebot-frontend.service

# Ver logs
sudo journalctl -u financebot-backend.service -f
```

---

## ðŸ“Š Monitoramento

### 1. Instalar PM2 (alternativa)

```bash
sudo npm install -g pm2

# Iniciar com PM2
pm2 start /home/pc/financebot/backend -- start
pm2 start /home/pc/financebot/frontend -- npm start

# Logs
pm2 logs

# Monitoramento
pm2 monit
```

### 2. Verificar Recursos

```bash
# CPU, memÃ³ria, disco
top
df -h
free -h

# ConexÃµes PostgreSQL
psql -U finance -d financebot -c "SELECT datname, count(*) FROM pg_stat_activity GROUP BY datname;"

# ConexÃµes de rede
sudo netstat -tulpn | grep node
```

### 3. Logs do NGINX

```bash
# Acesso
tail -f /var/log/nginx/financebot_access.log

# Erros
tail -f /var/log/nginx/financebot_error.log

# Com grep
grep "5[0-9][0-9]" /var/log/nginx/financebot_access.log
```

---

## ðŸ’¾ Backup

### 1. Backup Banco de Dados

```bash
# Manual
pg_dump -U finance -d financebot > /home/pc/backups/financebot_$(date +%Y%m%d_%H%M%S).sql

# Comprimido
pg_dump -U finance -d financebot | gzip > /home/pc/backups/financebot_$(date +%Y%m%d_%H%M%S).sql.gz

# Restaurar
psql -U finance -d financebot < backup.sql
```

### 2. Backup AutomÃ¡tico

```bash
# Criar script
nano /home/pc/backups/backup.sh

# Adicionar:
#!/bin/bash
BACKUP_DIR="/home/pc/backups"
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump -U finance -d financebot | gzip > $BACKUP_DIR/financebot_$DATE.sql.gz
# Manter apenas Ãºltimos 7 dias
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete

# Dar permissÃ£o
chmod +x /home/pc/backups/backup.sh

# Agendar no crontab (diariamente Ã s 2 AM)
crontab -e
# Adicionar: 0 2 * * * /home/pc/backups/backup.sh
```

### 3. Backup da AplicaÃ§Ã£o

```bash
# Arquivos importantes
tar -czf /home/pc/backups/financebot_app_$(date +%Y%m%d).tar.gz \
  /home/pc/financebot/backend/.env \
  /home/pc/financebot/frontend/.env \
  /home/pc/financebot/storage/wa-sessions/
```

---

## âœ… Checklist ProduÃ§Ã£o

- [ ] NGINX instalado e rodando
- [ ] Reverse proxy configurado
- [ ] Testes de carga executados
- [ ] SSL/HTTPS configurado
- [ ] Certificado SSL vÃ¡lido
- [ ] Services systemd criados
- [ ] Auto-start habilitado
- [ ] Logs configurados
- [ ] Monitoramento ativo
- [ ] Backup automÃ¡tico agendado
- [ ] Firewall configurado
- [ ] Fail2ban instalado (opcional)
- [ ] CDN configurado (opcional)

---

## ðŸš¨ Firewall (UFW)

```bash
# Habilitar
sudo ufw enable

# Permitir SSH
sudo ufw allow 22/tcp

# Permitir HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Bloquear portas internas
sudo ufw deny 3001/tcp
sudo ufw deny 5173/tcp

# Ver status
sudo ufw status
```

---

## ðŸ“ž Troubleshooting

### NGINX nÃ£o inicia

```bash
# Verificar erro
sudo nginx -t

# Ver logs
sudo systemctl status nginx
sudo journalctl -xe
```

### 502 Bad Gateway

```bash
# Backend nÃ£o respondendo?
curl -i http://127.0.0.1:3001/health

# Verificar se estÃ¡ rodando
ps aux | grep node

# Ver logs do backend
journalctl -u financebot-backend.service -f
```

### Certificado SSL expirado

```bash
# Renovar manualmente
sudo certbot renew --force-renewal

# Testar renovaÃ§Ã£o automÃ¡tica
sudo systemctl status certbot.timer
```


