package main

import (
	"log"
	"os"

	"github.com/Mr9esx/RiSu/server/internal/config"
	"github.com/Mr9esx/RiSu/server/internal/database"
	"github.com/Mr9esx/RiSu/server/internal/seeder"
)

// Upserts presets from publishDir/data/presets.json into the database,
// and syncs preset cover images into dataDir.
//
// Usage:
//
//	RISU_CONFIG=/etc/risu/config.yaml risu-sync-presets
func main() {
	configPath := os.Getenv("RISU_CONFIG")
	if configPath == "" {
		configPath = "config.yaml"
	}

	cfg, err := config.Load(configPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	db, err := database.Open(cfg.Database.Path)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}

	log.Printf("[sync-presets] publishDir=%s dataDir=%s", cfg.Storage.PublishDir, cfg.Storage.DataDir)

	if err := seeder.UpsertPresets(db, cfg.Storage.PublishDir); err != nil {
		log.Fatalf("Failed to upsert presets: %v", err)
	}
	if err := seeder.SyncPresetAssets(cfg.Storage.PublishDir, cfg.Storage.DataDir); err != nil {
		log.Fatalf("Failed to sync preset assets: %v", err)
	}

	log.Println("[sync-presets] done")
}
