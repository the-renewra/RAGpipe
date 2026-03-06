# Missing Deployment Files

To successfully deploy this Vite application to GitHub Pages, the repository is missing the automated build pipeline and configuration files. Without these, GitHub Pages attempts to serve the raw source code (which causes 404s for TypeScript files and bare imports) instead of the compiled `dist` assets.

## 1. `.github/workflows/deploy.yml`
**Purpose:** Automates the Vite build process (`npm run build`) and deploys the `dist` folder to GitHub Pages.
**Content:**
```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: ["main"]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: true

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "npm"
      - name: Install dependencies
        run: npm ci
      - name: Build
        run: npm run build
      - name: Setup Pages
        uses: actions/configure-pages@v4
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: "./dist"
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

## 2. `public/.nojekyll`
**Purpose:** Bypasses GitHub Pages' default Jekyll processing, which ignores files or directories starting with an underscore (`_`). While Vite 4+ uses `assets/` by default, some plugins or chunks may still generate underscore-prefixed files.
**Content:** *(Empty file)*

## 3. `public/404.html` (Optional but Recommended)
**Purpose:** If you ever add client-side routing (e.g., React Router), GitHub Pages will 404 on direct URL access. A basic `404.html` that redirects to `index.html` prevents this.
**Content:**
```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>SurgRAG</title>
    <script type="text/javascript">
      // Single Page Apps for GitHub Pages
      var pathSegmentsToKeep = 1;
      var l = window.location;
      l.replace(
        l.protocol + '//' + l.hostname + (l.port ? ':' + l.port : '') +
        l.pathname.split('/').slice(0, 1 + pathSegmentsToKeep).join('/') + '/?/' +
        l.pathname.slice(1).split('/').slice(pathSegmentsToKeep).join('/').replace(/&/g, '~and~') +
        (l.search ? '&' + l.search.slice(1).replace(/&/g, '~and~') : '') +
        l.hash
      );
    </script>
  </head>
  <body></body>
</html>
```
