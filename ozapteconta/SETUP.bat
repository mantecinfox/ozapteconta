@echo off
setlocal EnableDelayedExpansion
title FinanceBot - Setup Final
color 0A

echo.
echo.
echo  ╔════════════════════════════════════════════════════════════╗
echo  ║                                                            ║
echo  ║         FinanceBot - Sistema Pronto para Windows          ║
echo  ║                                                            ║
echo  ║        Terminais nao vao mais fechar automaticamente!      ║
echo  ║                                                            ║
echo  ╚════════════════════════════════════════════════════════════╝
echo.
echo.

echo  CHECKLIST PRE-INSTALACAO
echo  ════════════════════════════════════════════════════════════
echo.
echo  Abra Command Prompt (cmd) e execute:
echo.
echo  ☐ node --version
echo    (Deve mostrar v20.x.x ou superior)
echo    Se nao funcionar: https://nodejs.org/
echo.
echo  ☐ psql --version
echo    (Deve mostrar psql (PostgreSQL) 16.x)
echo    Se nao funcionar: https://bit.ly/postgresql16
echo.
echo  ☐ net start postgresql-x64-16
echo    (Inicia o PostgreSQL)
echo.
echo  ════════════════════════════════════════════════════════════
echo.
echo.

echo  INSTALACAO - 3 PASSOS
echo  ════════════════════════════════════════════════════════════
echo.
echo  PASSO 1: Verificacao (1 minuto)
echo  ────────────────────────────────
echo  Duplo-clique em: diagnostico.bat
echo.
echo  Isto vai verificar se tudo esta pronto.
echo  Se tiver erros, ele mostra como resolver.
echo.
echo  ════════════════════════════════════════════════════════════
echo.

pause

echo.
echo  PASSO 2: Instalacao (2 minutos)
echo  ────────────────────────────────
echo  Duplo-clique em: instalar.bat
echo.
echo  Isto vai instalar:
echo    - Backend (npm install)
echo    - Frontend (npm install)
echo    - Prisma (generate)
echo.
echo  Se tiver erro, ele PAUSA e mostra como resolver.
echo.
echo  ════════════════════════════════════════════════════════════
echo.

pause

echo.
echo  PASSO 3: Executar (1 minuto)
echo  ────────────────────────────────
echo  Duplo-clique em: dev-start.bat
echo.
echo  Isto vai abrir 2 terminais automaticamente:
echo    - Terminal 1: Backend (npm run dev)
echo    - Terminal 2: Frontend (npm run dev)
echo.
echo  Ambos vao rodar em desenvolvimento.
echo  Se houver erro, o terminal PAUSA e mostra o erro.
echo.
echo  ════════════════════════════════════════════════════════════
echo.

pause

echo.
echo  PRONTO!
echo  ════════════════════════════════════════════════════════════
echo.
echo  Acesse no navegador:
echo.
echo    http://localhost:5173
echo.
echo  Login padrao:
echo    Usuario: admin
echo    Senha: admin123
echo.
echo  ════════════════════════════════════════════════════════════
echo.
echo.
pause
