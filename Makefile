.PHONY: all clean install build package test test-local test-unit lint \
       quick dev watch rebuild prebuilds help

# ── Variables ─────────────────────────────────────────────────────────
BIN_DIR       := bin
PREBUILDS_DIR := prebuilds
EXTENSION_NAME := vscode-winccoa-database
VERSION       := $(shell node -p "require('./package.json').version")
EXT_PUBLISHER := winccoa-tools-pack
EXT_ID        := $(EXT_PUBLISHER).$(EXTENSION_NAME)
NPM           := npm
VSCE          := npx @vscode/vsce
PLATFORM      := $(shell node -p "process.platform")
ARCH          := $(shell node -p "process.arch")
NODE_ABI      := $(shell node -p "process.versions.modules")
NODE_GYP      := npx node-gyp
NODE_RM       := node -e "require('fs').rmSync(process.argv[1], { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })"
NODE_MKDIR    := node -e "require('fs').mkdirSync(process.argv[1], { recursive: true })"
NODE_LS       := node -e "const fs=require('fs'); const path=require('path'); const dir=process.argv[1]; if (fs.existsSync(dir)) { for (const entry of fs.readdirSync(dir)) console.log(path.join(dir, entry)); }"

# Test workspace configuration
TEST_WORKSPACE ?= .
CODE_BIN       ?= code

# ── Default ───────────────────────────────────────────────────────────
all: clean install build prebuilds package

# ── Clean ─────────────────────────────────────────────────────────────
clean:
	@echo "Cleaning build artifacts..."
	@$(NODE_RM) out
	@$(NODE_RM) dist
	@$(NODE_RM) $(BIN_DIR)
	@$(NODE_RM) $(PREBUILDS_DIR)
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

# ── Native prebuilds ─────────────────────────────────────────────────
# Collects better-sqlite3 binaries for both Node.js and Electron so the
# extension works in local VS Code (Electron) AND Remote SSH (Node.js).
#
# On Linux the Node.js prebuilds are downloaded from the better-sqlite3
# GitHub releases (built on old glibc ≤ 2.29, portable across distros).
# On other platforms they are compiled locally via node-gyp.

# Node versions whose prebuilds we ship (VS Code Server may use either)
NODE_TARGETS ?= 20.0.0 22.0.0 24.0.0

# Electron cross-compilation arch (defaults to host ARCH)
ELECTRON_ARCH ?= $(ARCH)

prebuilds: prebuild-node prebuild-electron
	@echo "Prebuilds collected in $(PREBUILDS_DIR)/$(PLATFORM)-$(ARCH)/"
	@$(NODE_LS) $(PREBUILDS_DIR)/$(PLATFORM)-$(ARCH)

prebuild-node:
	@echo "Downloading portable Node.js prebuilds from GitHub releases..."
	@node scripts/collect-prebuilds.js --platform $(PLATFORM) --arch $(ARCH) --download-node $(NODE_TARGETS)

# Electron version targeted by VS Code (update when bumping engines.vscode)
ELECTRON_VERSION ?= 39.3.0

prebuild-electron:
	@echo "Downloading Electron $(ELECTRON_VERSION) prebuild from GitHub releases..."
	@node scripts/collect-prebuilds.js --platform $(PLATFORM) --arch $(ELECTRON_ARCH) --download-electron $(ELECTRON_VERSION)

# ── Package ───────────────────────────────────────────────────────────
package:
	@echo "Packaging VSIX..."
	@$(NODE_MKDIR) $(BIN_DIR)
	@$(VSCE) package --out $(BIN_DIR)/$(EXTENSION_NAME)-$(VERSION).vsix
	@echo "Packaged: $(BIN_DIR)/$(EXTENSION_NAME)-$(VERSION).vsix"

package-target:
	@echo "Packaging platform-specific VSIX ($(PLATFORM)-$(ARCH))..."
	@$(NODE_MKDIR) $(BIN_DIR)
	@$(VSCE) package --target $(PLATFORM)-$(ARCH) \
		--out $(BIN_DIR)/$(EXTENSION_NAME)-$(VERSION)-$(PLATFORM)-$(ARCH).vsix
	@echo "Packaged: $(BIN_DIR)/$(EXTENSION_NAME)-$(VERSION)-$(PLATFORM)-$(ARCH).vsix"

# ── Lint & Test ───────────────────────────────────────────────────────
lint:
	@$(NPM) run lint

test: test-unit

test-unit:
	@$(NPM) run test:unit

test-local: prebuild-electron
	@echo "Testing with rebuilt native modules..."
	@node scripts/test-local.js $(BIN_DIR) $(EXTENSION_NAME) $(VERSION) \
		$(EXT_ID) $(CODE_BIN) $(TEST_WORKSPACE)

# ── Dev shortcuts ─────────────────────────────────────────────────────
dev: build package

quick: build prebuilds package

watch:
	@$(NPM) run watch

rebuild: clean-all install build

# ── Info ──────────────────────────────────────────────────────────────
info:
	@echo "Extension:  $(EXT_ID) v$(VERSION)"
	@echo "Platform:   $(PLATFORM)-$(ARCH)"
	@echo "Node ABI:   $(NODE_ABI)"
	@echo "Prebuilds:  $(PREBUILDS_DIR)/$(PLATFORM)-$(ARCH)/"
	@node -e "const fs=require('fs'),path=require('path');const d='$(PREBUILDS_DIR)/$(PLATFORM)-$(ARCH)';if(fs.existsSync(d)){for(const e of fs.readdirSync(d))console.log(' '+path.join(d,e));}else{console.log('  (none \u2014 run \'make prebuilds\')')}"

# ── Help ──────────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "Usage: make <target>"
	@echo ""
	@echo "Build & Package:"
	@echo "  all              Clean, install, build, prebuilds, package (default)"
	@echo "  install          Install npm dependencies"
	@echo "  build            Compile TypeScript via webpack"
	@echo "  prebuilds        Collect native binaries for Node + Electron"
	@echo "  package          Create universal .vsix in bin/"
	@echo "  package-target   Create platform-specific .vsix in bin/"
	@echo "  dev              Build + package (TS only, no native rebuild)"
	@echo "  quick            Build + prebuilds + package (no clean/install)"
	@echo ""
	@echo "Quality:"
	@echo "  lint             Run ESLint"
	@echo "  test             Run unit tests (alias for test-unit)"
	@echo "  test-unit        Run unit tests"
	@echo "  test-local       Build, install into VS Code, open workspace"
	@echo ""
	@echo "Housekeeping:"
	@echo "  clean            Remove dist/, bin/, prebuilds/"
	@echo "  clean-all        clean + remove node_modules/"
	@echo "  rebuild          clean-all + install + build"
	@echo "  watch            Webpack watch mode"
	@echo "  info             Show current build environment"
	@echo ""
	@echo "Options:"
	@echo "  TEST_WORKSPACE   Path to WinCC OA project  (default: .)"
	@echo "  CODE_BIN         VS Code binary             (default: code)"
	@echo ""
