# PianoJazz Trainer

Application desktop Electron + Vite + React pour connecter un piano MIDI et travailler des exercices de jazz avec un clavier visuel et des notes qui defilent.

## Ce qui est deja pret

- Connexion MIDI via Web MIDI dans Electron
- Clavier visuel synchronise avec les notes jouees sur le piano physique
- Piano roll avec notes qui descendent jusqu a la zone de frappe
- Avancement de l exercice uniquement quand la bonne note ou le bon voicing est joue
- Parcours de base pour gammes, shells II V I, arpeges et premiere cellule bebop
- Task VS Code de build

## Stack

- Electron
- React 18
- TypeScript
- Vite
- electron-builder

## Demarrage

```bash
npm install
npm run dev
```

L application ouvre une fenetre desktop Electron et utilise le renderer Vite en developpement.

## Build

```bash
npm run build
```

Cette commande lance TypeScript puis le build Vite.

## Packaging macOS

```bash
npm run dist:mac
```

Important: la creation du package macOS doit etre executee depuis une machine macOS. Le script est configure dans le projet, mais il ne peut pas produire un binaire mac valide depuis ce poste Windows.

## Exercices

Les exercices se trouvent dans `src/data/exercises.ts`.

Tu peux ajouter:

- des gammes par tonalite et mode
- des voicings rootless
- des grilles II V I dans 12 tonalites
- des patterns bebop
- des enchainements d arpeges
- des exercices d improvisation guidee

Chaque exercice contient une suite d etapes avec:

- les notes attendues
- un label
- un conseil de jeu
- une duree visuelle pour le defilement

## MIDI

Le support MIDI passe par `navigator.requestMIDIAccess()` cote renderer, avec permissions autorisees par Electron dans `electron/main.js`.

Si le piano n apparait pas:

1. verifier que le clavier est bien detecte par macOS
2. relancer l application
3. rebrancher le cable ou l interface MIDI

## Prochaine evolution utile

- ajouter des banques d exercices par niveau
- memoriser les scores et la progression
- ajouter metronome et compte a rebours
- proposer des grilles d accords et backing tracks
- analyser la justesse rythmique et les erreurs recurrentes
