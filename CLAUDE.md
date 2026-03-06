# AssurCalc — Calculateur d'Assurance Emprunteur

## Contexte du projet

Site statique (HTML/CSS/JS pur) permettant de calculer le coût de l'assurance
emprunteur à partir des données disponibles dans une offre de prêt immobilier,
et de suivre l'avancement d'un prêt en cours.

**Problème résolu :** le coût de l'assurance n'est pas toujours lisible
directement sur les documents de prêt. Ce calculateur l'isole par déduction :

```
Coût assurance/mois = Mensualité totale − Mensualité théorique hors assurance

Mensualité hors assurance = Capital × r / (1 − (1+r)^−n)
  avec r = taux nominal / 12  et  n = durée en mois

TAEA = (Coût assurance/mois × 12 / Capital) × 100

Mois payés = f(date 1ʳᵉ échéance, date du jour)
  → si jour_courant ≥ jour_échéance : totalMois + 1, sinon totalMois
```

## Architecture

```
index.html   — structure HTML sémantique, formulaire + zone résultats
style.css    — design system (variables CSS), responsive 4 breakpoints, dark mode, print
script.js    — calculs, validation, graphique Canvas (donut), DOM updates,
               tableau d'amortissement, suivi prêt en cours, partage URL hash, localStorage
favicon.svg  — icône SVG inline (logo bleu)
```

Aucune dépendance npm. Ouvrable directement dans un navigateur sans serveur.

## Lancer le projet

```bash
# Option 1 — ouvrir directement
open index.html

# Option 2 — serveur local (évite les restrictions CORS éventuelles)
python3 -m http.server 8080
# puis http://localhost:8080
```

## Breakpoints responsive

| Breakpoint  | Layout |
|-------------|--------|
| < 400 px    | Suivi KPI grid en 2 colonnes (au lieu de 3) |
| < 520 px    | Colonne unique, cards padding réduit |
| 520–768 px  | Formulaire 2 colonnes, KPIs 2 colonnes |
| ≥ 768 px    | Layout 2 colonnes (formulaire fixe | résultats défilants) |
| ≥ 1024 px   | Colonne formulaire élargie (460px) |

## Hébergement GitHub Pages

Settings → Pages → Source : branche `main`, dossier `/`
URL : `https://antexa.github.io/AssurCalc/`

## Fonctionnalités implémentées

- ✅ Calcul TAEA, coût mensuel / annuel / total
- ✅ Graphique donut Canvas (adapté au mode sombre)
- ✅ Tableau d'amortissement mois par mois + export CSV
- ✅ Partage Web Share API avec lien pré-rempli (hash URL)
- ✅ Export PDF (`window.print()` + `@media print`)
- ✅ Mode sombre automatique (`prefers-color-scheme: dark`)
- ✅ Persistance localStorage + bouton Réinitialiser
- ✅ Validation onblur des champs
- ✅ Meta SEO + Open Graph + favicon + theme-color iOS
- ✅ Responsive iPhone 16 (overflow-x corrigé)
- ✅ **Suivi de prêt en cours** (date de 1ʳᵉ échéance → mois payés calculés automatiquement)
  - Barre de progression avec % remboursé et plage de dates
  - 6 KPIs : assurance payée/restante, intérêts payés/restants, capital remboursé/restant dû
  - Tableau : colonne Date, lignes payées en vert, prochain prélèvement surligné en bleu
  - Auto-expansion du tableau et scroll vers l'échéance courante
  - Date persistée en localStorage, repliée/dépliée automatiquement

---

## Évolutions possibles

### Court terme
- **Simulation par TAEA cible** : l'utilisateur saisit un taux d'assurance
  souhaité et obtient la mensualité équivalente — utile pour comparer les offres
- **Comparateur multi-offres** : tableau côte à côte de 2-3 devis assureurs
  (nom, TAEA, coût mensuel, économie vs assurance groupe)

### Moyen terme
- **Assurance sur capital restant dû (CRD)** : option pour calculer l'assurance
  sur le CRD plutôt que sur le capital initial — donne un coût total différent
  et souvent plus avantageux
- **Simulateur de délégation d'assurance** : comparer le coût de l'assurance
  groupe bancaire vs une délégation externe avec économies cumulées sur la durée

### Long terme
- **Back-end léger** (ex. Cloudflare Workers) : sauvegarde de simulations,
  historique, comparaisons entre différentes dates
- **Intégration API assureurs** : récupération de vrais devis en temps réel
- **PWA** : manifest + service worker pour utilisation hors-ligne sur mobile
- **Internationalisation** : adapter les formules et formats pour d'autres pays
  (Belgique, Suisse, Canada — réglementations différentes)
