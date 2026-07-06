.PHONY: all clean install build package test test-local test-unit lint \
       quick dev watch rebuild help

# ── Variables ─────────────────────────────────────────────────────────
BIN_DIR       := bin
EXTENSION_NAME := vscode-winccoa-database
VERSION       := $(shell node -p "require('./package.json').version")
EXT_PUBLISHER := winccoa-tools-pack
EXT_ID        := $(EXT_PUBLISHER).$(EXTENSION_NAME)
NPM           := npm
VSCE          := npx @vscode/vsce
PLATFORM      := $(shell node -p "process.platform")
ARCH          := $(shell node -p "process.arch")
NODE_RM       := node -e "require('fs').rmSync(process.argv[1], { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })"
NODE_MKDIR    := node -e "require('fs').mkdirSync(process.argv[1], { recursive: true })"
NODE_LS       := node -e "const fs=require('fs'); const path=require('path'); const dir=process.argv[1]; if (fs.existsSync(dir)) { for (const entry of fs.readdirSync(dir)) console.log(path.join(dir, entry)); }"

# Test workspace configuration
TEST_WORKSPACE ?= .
CODE_BIN       ?= code

# ── Default ───────────────────────────────────────────────────────────
all: clean install build package

# ── Clean ─────────────────────────────────────────────────────────────
clean:
	@echo "Cleaning build artifacts..."
	@$(NODE_RM) out
	@$(NODE_RM) dist
	@$(NODE_RM) $(BIN_DIR)
	@echo "Clean complete."

clean-all: clean
	@echo "Removing node_modules..."
	@$(NODE_RM) node_modules
	@echo "Clean-all complete."

# ── Install ───────────────────────────────────────────────────────────
install:
	@echo "Installing dependencies..."
	@$(NPM) install
	@echo "Dependencies installed."

# ── Build ─────────────────────────────────────────────────────────────
build:
	@echo "Building extension..."
	@$(NPM) run compile
	@echo "Build complete."

# ── Package ───────────────────────────────────────────────────────────
package:
	@echo "Packaging VSIX..."
	@$(NODE_MKDIR) $(BIN_DIR)
	@$(VSCE) package --out $(BIN_DIR)/$(EXTENSION_NAME)-$(VERSION).vsix
	@echo "Packaged: $(BIN_DIR)/$(EXTENSION_NAME)-$(VERSION).vsix"

# ── Lint & Test ───────────────────────────────────────────────────────
lint:
	@$(NPM) run lint

test: test-unit

test-unit:
	@$(NPM) run test:unit

test-local:
	@echo "Running local tests..."
	@node scripts/test-local.js $(BIN_DIR) $(EXTENSION_NAME) $(VERSION) \
		$(EXT_ID) $(CODE_BIN) $(TEST_WORKSPACE)

# ── Dev shortcuts ─────────────────────────────────────────────────────
dev: build package

quick: build package

watch:
	@$(NPM) run watch

rebuild: clean-all install build

# ── Info ──────────────────────────────────────────────────────────────
info:
	@echo "Extension:  $(EXT_ID) v$(VERSION)"
	@echo "Platform:   $(PLATFORM)-$(ARCH)"

# ── Help ──────────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "Usage: make <target>"
	@echo ""
	@echo "Build & Package:"
	@echo "  all              Clean, install, build, package (default)"
	@echo "  install          Install npm dependencies"
	@echo "  build            Compile TypeScript via webpack"
	@echo "  package          Create universal .vsix in bin/"
	@echo "  dev              Build + package"
	@echo "  quick            Build + package (no clean/install)"
	@echo ""
	@echo "Quality:"
	@echo "  lint             Run ESLint"
	@echo "  test             Run unit tests (alias for test-unit)"
	@echo "  test-unit        Run unit tests"
	@echo "  test-local       Build, install into VS Code, open workspace"
	@echo ""
	@echo "Housekeeping:"
	@echo "  clean            Remove dist/, bin/"
	@echo "  clean-all        clean + remove node_modules/"
	@echo "  rebuild          clean-all + install + build"
	@echo "  watch            Webpack watch mode"
	@echo "  info             Show current build environment"
	@echo ""
	@echo "Options:"
	@echo "  TEST_WORKSPACE   Path to WinCC OA project  (default: .)"
	@echo "  CODE_BIN         VS Code binary             (default: code)"
	@echo ""
