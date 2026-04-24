# Contributing to Robinhood Data Exporter

First off, thank you for considering contributing to this project! It's people like you that make it better for everyone.

## 🛠 Development Workflow

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher.
- **npm**: v9.0.0 or higher.

### 2. Setup
Clone the repository and install dependencies:
```bash
git clone https://github.com/myselflokendra/robhinhood-chrome-plugin.git
cd robhinhood-chrome-plugin
npm install
```

### 3. Building the Extension
The project uses `esbuild` for fast bundling.

- **One-time build**:
  ```bash
  npm run build
  ```
- **Watch mode (recommended for development)**:
  ```bash
  npm run watch
  ```

### 4. Loading in Chrome
1. Open Chrome and go to `chrome://extensions/`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select the root folder of this project.

## 🌿 Branching Strategy

- `main`: The stable production branch.
- Feature branches: `feature/your-feature-name`
- Bug fixes: `fix/issue-description`

## 📬 Pull Request Process

1. Fork the repo and create your branch from `main`.
2. Ensure your code follows the existing style.
3. Update the `README.md` if you've added new features or configuration.
4. Open a Pull Request with a clear title and description of the changes.

## 🐛 Reporting Bugs

If you find a bug, please open an issue and include:
- A clear description of the problem.
- Steps to reproduce the issue.
- Your browser version and OS.
- Any relevant console logs.

## 💡 Feature Requests

We love new ideas! Please open an issue and describe:
- What problem the feature would solve.
- How you imagine it working.

## 📄 License
By contributing, you agree that your contributions will be licensed under the project's **ISC License**.
