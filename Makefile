.PHONY: dev dev-app dev-admin dev-server migrate build

# Start all services for local development
dev:
	@echo "Starting all services..."
	@cd server && go run ./cmd/ &
	@pnpm --filter app dev &
	@pnpm --filter admin dev

# Individual services
dev-app:
	pnpm --filter app dev

dev-admin:
	pnpm --filter admin dev

dev-server:
	cd server && go run ./cmd/

# Run migration
migrate:
	cd server && go run ./scripts/migrate/

# Build all
build:
	pnpm --filter app build
	pnpm --filter admin build
	cd server && go build -o risu-server ./cmd/
