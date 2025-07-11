# Welcome to Remix!

- 📖 [Remix docs](https://remix.run/docs)

## Development

Run the dev server:

```shellscript
npm run dev
```

## Deployment

First, build your app for production:

```sh
npm run build
```

Then run the app in production mode:

```sh
npm start
```

Now you'll need to pick a host to deploy it to.

### DIY

If you're familiar with deploying Node applications, the built-in Remix app server is production-ready.

Make sure to deploy the output of `npm run build`

- `build/server`
- `build/client`

## Styling

This template comes with [Tailwind CSS](https://tailwindcss.com/) already configured for a simple default starting experience. You can use whatever css framework you prefer. See the [Vite docs on css](https://vitejs.dev/guide/features.html#css) for more information.

# Kava Training V2

## Development

### Commit Conventions

This project uses [Commitizen](https://commitizen-tools.github.io/commitizen/) with [Conventional Commits](https://www.conventionalcommits.org/) for standardized commit messages.

#### Making Commits

You have two options for making commits:

1. **Automatic (Recommended)**: Just use `git commit` and Commitizen will automatically prompt you:
   ```bash
   git add .
   git commit
   # Commitizen will open an interactive prompt
   ```

2. **Manual**: Use the npm script:
   ```bash
   git add .
   npm run commit
   # Commitizen will open an interactive prompt
   ```

#### Commit Types

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation only changes
- **style**: Changes that do not affect the meaning of the code (white-space, formatting, etc)
- **refactor**: A code change that neither fixes a bug nor adds a feature
- **perf**: A code change that improves performance
- **test**: Adding missing tests or correcting existing tests
- **chore**: Changes to the build process or auxiliary tools and libraries

#### Pre-commit Hooks

The project automatically runs ESLint on all staged files before each commit. If there are linting errors, the commit will be blocked until they are fixed.

## Getting Started
