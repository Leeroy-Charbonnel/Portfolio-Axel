# Checklist
Maj 16:57 - 11/11

## En cours

## A faire

## Bloque

## Fait
- [x] Vrai socle identifie : origin/master (6052e20), pas 5f8ad10
- [x] Sortie de vue-shared-ui : auth, composables, pages, tokens inlines
- [x] auth.ts reecrit : role en input:false, aucun chemin vers admin
- [x] Inscription refusee des qu'un compte existe
- [x] enforceSingleAccount au boot, roles pending/banned et modes d'auth supprimes
- [x] Guard du routeur : requiresAdmin sur /settings et /edit-3d
- [x] /diag et /api/_diag publics supprimes
- [x] Uploads : fileFilter extension + type MIME
- [x] Seed i18n : onConflictDoNothing, n'ecrase plus les libelles edites
- [x] env.ts : plus de fallback silencieux
- [x] Dockerfile sans GITHUB_TOKEN, .npmrc supprime
- [x] Migration drizzle 0000 : 14 tables
- [x] Build vert : vue-tsc, vite, tsc serveur
- [x] Service compose "stack" cree : app + db prod + db dev + volume storage
- [x] Ports 5449/5450 choisis apres lecture des ports pris sur le VPS
- [x] Donnees de prod restaurees : 4 projets, 9 galerie, 4 experiences, 93 fichiers
- [x] 771 Mo de medias copies dans le volume de la stack
- [x] Compte leeroydylan0@gmail.com passe admin
- [x] Base dev = copie exacte de la prod
- [x] Domaine axel.somerandomcreator.com bascule sur la stack, site en HTTP 200
- [x] Anciens services application + postgres supprimes
- [x] Sauvegardes conservees sur le VPS avant suppression
- [x] Documentation CLAUDE.md et SETUP.md reecrites
