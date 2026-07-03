.PHONY: help install lint typecheck test build check dev preview clean

NPM ?= npm

help:
	@echo "Linegra development targets"
	@echo ""
	@echo "  make install     Install npm dependencies"
	@echo "  make lint        Run ESLint (zero warnings)"
	@echo "  make typecheck   Run TypeScript compiler (no emit)"
	@echo "  make test        Run Vitest unit tests"
	@echo "  make build       Lint, typecheck, test, and Vite production build"
	@echo "  make check       Alias for lint + typecheck + test (no Vite build)"
	@echo "  make dev         Start Vite dev server"
	@echo "  make preview     Serve the production build locally"
	@echo "  make clean       Remove build output"

install:
	$(NPM) install

lint:
	$(NPM) run lint

typecheck:
	$(NPM) run typecheck

test:
	$(NPM) run test

build: lint typecheck test
	$(NPM) exec vite build

check: lint typecheck test

dev:
	$(NPM) run dev

preview:
	$(NPM) run preview

clean:
	rm -rf dist
