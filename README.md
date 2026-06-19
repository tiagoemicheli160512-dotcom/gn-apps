# GN Apps

Aplicativo desktop com atualizações automáticas online.

## Desenvolvimento

```bash
npm install
npm run dev
```

## Build

```bash
npm run build          # Build para o OS atual
npm run build:win      # Build para Windows
npm run build:mac      # Build para macOS
npm run build:linux    # Build para Linux
```

## Publicar nova versão

1. Atualize a versão no `package.json`
2. Crie uma tag git:
   ```bash
   git tag v1.1.0
   git push origin v1.1.0
   ```
3. O GitHub Actions vai buildar e publicar automaticamente

O app instalado vai detectar a nova versão e notificar o usuário.
