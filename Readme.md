Here is a clean, fully copy-paste ready **README.md** file.

You can paste this directly into `README.md`.

---

````markdown
# 🔐 Secure Husky Setup

Automatic local security setup for JavaScript projects.

This tool configures:

- ✅ Husky (Git hooks)
- ✅ Gitleaks (Secret scanning)
- ✅ Pre-commit protection
- ✅ Fully local installation (no global dependencies)
- ✅ Ubuntu compatible (Linux x64)

---

## 📦 What This Tool Does

When initialized, it:

1. Verifies you are inside a Git repository
2. Installs Husky locally
3. Adds required `prepare` script (if missing)
4. Downloads Gitleaks Linux binary locally
5. Creates `.tools/gitleaks/`
6. Configures `.husky/pre-commit`
7. Blocks commits if secrets are detected

Everything runs locally inside your repository.

No global installs required.

---

## 🚀 Installation

Inside any JavaScript project:

```bash
npm install --save-dev secure-husky-setup
````

---

## ⚙️ Initialize Security Setup

After installing, run:

```bash
npx secure-husky-setup init
```

You should see output similar to:

```
Initializing secure git hooks...
Initializing Husky...
Installing Gitleaks locally...
Secure Husky + Gitleaks setup completed.
```

---

## 📁 Project Structure After Setup

```
.tools/
   gitleaks/
       gitleaks

.husky/
   pre-commit
```

---

## 🔎 How Secret Scanning Works

The pre-commit hook runs:

```bash
./.tools/gitleaks/gitleaks detect \
  --source . \
  --no-git \
  --verbose \
  --redact=false
```

This scans the working directory before every commit.

If secrets are found:

* Commit is blocked
* File name and line number are displayed
* Developer must fix the issue before committing

---

## 🧪 Test the Setup

Add a fake AWS key in your code:

```js
const AWS_SECRET_ACCESS_KEY = "AKIAIOSFODNN7EXAMPLE";
```

Then try committing:

```bash
git add .
git commit -m "test secret"
```

The commit will fail and show the detected secret.

---

## 🔄 Re-run Setup

The setup is idempotent.

You can safely run:

```bash
npx secure-husky-setup init
```

multiple times.

---

## 🛠 Requirements

* Ubuntu (Linux x64)
* Node.js
* Git installed

No global Gitleaks installation required.

---

## 🧹 Manual Removal

To remove the setup:

```bash
rm -rf .tools
rm -rf .husky
```

Also remove `secure-husky-setup` from `package.json` if needed.

---

## 🧠 Why No Automatic postinstall?

This tool intentionally avoids `postinstall` because:

* It may be skipped in CI
* It can fail silently
* It hides setup logic
* It makes debugging difficult

Explicit initialization is more reliable and production-safe.

---

## 🔒 Security Notes

* Gitleaks version is pinned
* Binary is installed locally per project
* No system-level modifications
* Fully self-contained

---

## 📌 Summary

This tool provides:

* Real DevSecOps-grade secret protection
* No global dependencies
* Fully automated local binary management
* Modern Husky integration
* Reliable commit blocking

---

## 🏗 Future Improvements (Optional)

* Custom `.gitleaks.toml` support
* CI integration
* Cross-platform binary detection
* ARM support
* Commit message linting

```

---

If you want, I can now also give you:

- A **strict enterprise `.gitleaks.toml`**
- CI/CD integration guide
- Multi-platform version
- Private npm publishing guide
```
